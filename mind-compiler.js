/**
 * Compilador nativo CPU de archivos .mind (Formato oficial MindAR v2 MsgPack)
 * No depende de WebGL ni de TensorFlow.js, evitando bloqueos en 2% o 5% en cualquier navegador o tarjeta gráfica.
 */
(function (globalScope) {
    'use strict';

    // 1. Puntos del descriptor FREAK (37 puntos oficiales de MindAR)
    const FREAK_RINGS = [
        { sigma: 0.55, points: [[-1, 0], [-0.5, -0.866025], [0.5, -0.866025], [1, -0], [0.5, 0.866025], [-0.5, 0.866025]] },
        { sigma: 0.475, points: [[0, 0.930969], [-0.806243, 0.465485], [-0.806243, -0.465485], [-0, -0.930969], [0.806243, -0.465485], [0.806243, 0.465485]] },
        { sigma: 0.4, points: [[0.847306, -0], [0.423653, 0.733789], [-0.423653, 0.733789], [-0.847306, 0], [-0.423653, -0.733789], [0.423653, -0.733789]] },
        { sigma: 0.325, points: [[-0, -0.741094], [0.641806, -0.370547], [0.641806, 0.370547], [0, 0.741094], [-0.641806, 0.370547], [-0.641806, -0.370547]] },
        { sigma: 0.25, points: [[-0.595502, 0], [-0.297751, -0.51572], [0.297751, -0.51572], [0.595502, -0], [0.297751, 0.51572], [-0.297751, 0.51572]] },
        { sigma: 0.175, points: [[0, 0.362783], [-0.314179, 0.181391], [-0.314179, -0.181391], [-0, -0.362783], [0.314179, -0.181391], [0.314179, 0.181391]] },
        { sigma: 0.1, points: [[0, 0]] }
    ];
    const FREAKPOINTS = [];
    for (let i = 0; i < FREAK_RINGS.length; i++) {
        const s = FREAK_RINGS[i].sigma;
        const pts = FREAK_RINGS[i].points;
        for (let j = 0; j < pts.length; j++) {
            FREAKPOINTS.push([s, pts[j][0], pts[j][1]]);
        }
    }
    const NUM_FREAK_POINTS = FREAKPOINTS.length; // 37
    const FREAK_COMPARISON_COUNT = (NUM_FREAK_POINTS - 1) * NUM_FREAK_POINTS / 2; // 666
    const DESCRIPTOR_BYTES = Math.ceil(FREAK_COMPARISON_COUNT / 8); // 84

    // Pares precalculados para FREAK
    const FREAK_PAIRS_P1 = new Int32Array(FREAK_COMPARISON_COUNT);
    const FREAK_PAIRS_P2 = new Int32Array(FREAK_COMPARISON_COUNT);
    {
        let idx = 0;
        for (let a = 0; a < NUM_FREAK_POINTS; a++) {
            for (let b = a + 1; b < NUM_FREAK_POINTS; b++) {
                FREAK_PAIRS_P1[idx] = a;
                FREAK_PAIRS_P2[idx] = b;
                idx++;
            }
        }
    }

    // Propiedades radiales precalculadas para histograma de orientación
    const ORIENTATION_NUM_BINS = 36;
    const RADIAL_LIST = [];
    {
        const r = -1 / (2 * 3 * 3);
        const radius = 3 * 1.5;
        const maxR = Math.ceil(radius);
        for (let dy = -maxR; dy <= maxR; dy++) {
            for (let dx = -maxR; dx <= maxR; dx++) {
                const d2 = dx * dx + dy * dy;
                if (d2 <= radius * radius) {
                    const h = d2 * r;
                    const w = (720 + h * (720 + h * (360 + h * (120 + h * (30 + h * (6 + h)))))) * 0.0013888888;
                    RADIAL_LIST.push([dy, dx, w]);
                }
            }
        }
    }

    // 2. Utilidades de Redimensionado y Pirámide de Escalas
    function resizeGreyImage(image, ratio) {
        const w = Math.round(image.width * ratio);
        const h = Math.round(image.height * ratio);
        const dst = new Uint8Array(w * h);
        const src = image.data;
        const srcW = image.width;
        const srcH = image.height;

        for (let x = 0; x < w; x++) {
            let sx0 = Math.round(x / ratio);
            let sx1 = Math.round((x + 1) / ratio) - 1;
            if (sx1 >= srcW) sx1 = srcW - 1;
            if (sx0 > sx1) sx0 = sx1;
            for (let y = 0; y < h; y++) {
                let sy0 = Math.round(y / ratio);
                let sy1 = Math.round((y + 1) / ratio) - 1;
                if (sy1 >= srcH) sy1 = srcH - 1;
                if (sy0 > sy1) sy0 = sy1;
                let sum = 0;
                let cnt = 0;
                for (let yy = sy0; yy <= sy1; yy++) {
                    const rowOff = yy * srcW;
                    for (let xx = sx0; xx <= sx1; xx++) {
                        sum += src[rowOff + xx];
                        cnt++;
                    }
                }
                dst[y * w + x] = Math.floor(sum / cnt);
            }
        }
        return { data: dst, width: w, height: h, scale: ratio };
    }

    function buildImageList(targetImage) {
        const minDim = Math.min(targetImage.width, targetImage.height);
        const ratios = [];
        let r = 100 / minDim;
        const step = Math.pow(2, 1 / 3);
        for (;;) {
            ratios.push(r);
            r *= step;
            if (r >= 0.95) {
                r = 1;
                break;
            }
        }
        ratios.push(r);
        ratios.reverse();
        const list = [];
        for (let i = 0; i < ratios.length; i++) {
            list.push(resizeGreyImage(targetImage, ratios[i]));
        }
        return list;
    }

    function buildTrackingImageList(targetImage) {
        const minDim = Math.min(targetImage.width, targetImage.height);
        const ratios = [256 / minDim, 128 / minDim];
        return ratios.map(r => resizeGreyImage(targetImage, r));
    }

    // 3. Operaciones del Detector en CPU (Float32Array directo)
    function clamp(v, max) {
        return v < 0 ? 0 : (v >= max ? max - 1 : v);
    }

    function applyBinomialFilter(img) {
        const w = img.width;
        const h = img.height;
        const src = img.data;
        const tmp = new Float32Array(w * h);
        const dst = new Float32Array(w * h);

        // Horizontal: [1, 4, 6, 4, 1]
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const xm2 = x >= 2 ? x - 2 : 0;
                const xm1 = x >= 1 ? x - 1 : 0;
                const xp1 = x + 1 < w ? x + 1 : w - 1;
                const xp2 = x + 2 < w ? x + 2 : w - 1;
                tmp[row + x] = src[row + xm2] + 4 * src[row + xm1] + 6 * src[row + x] + 4 * src[row + xp1] + src[row + xp2];
            }
        }

        // Vertical: [1, 4, 6, 4, 1] / 256
        for (let y = 0; y < h; y++) {
            const ym2 = (y >= 2 ? y - 2 : 0) * w;
            const ym1 = (y >= 1 ? y - 1 : 0) * w;
            const y0 = y * w;
            const yp1 = (y + 1 < h ? y + 1 : h - 1) * w;
            const yp2 = (y + 2 < h ? y + 2 : h - 1) * w;
            for (let x = 0; x < w; x++) {
                dst[y0 + x] = (tmp[ym2 + x] + 4 * tmp[ym1 + x] + 6 * tmp[y0 + x] + 4 * tmp[yp1 + x] + tmp[yp2 + x]) * 0.00390625;
            }
        }
        return { data: dst, width: w, height: h };
    }

    function downsampleBilinear(img) {
        const w = img.width;
        const h = img.height;
        const outW = Math.floor(w / 2);
        const outH = Math.floor(h / 2);
        const src = img.data;
        const dst = new Float32Array(outW * outH);
        for (let y = 0; y < outH; y++) {
            const sy = y * 2;
            const r0 = sy * w;
            const r1 = (sy + 1) * w;
            const outRow = y * outW;
            for (let x = 0; x < outW; x++) {
                const sx = x * 2;
                dst[outRow + x] = 0.25 * (src[r0 + sx] + src[r0 + sx + 1] + src[r1 + sx] + src[r1 + sx + 1]);
            }
        }
        return { data: dst, width: outW, height: outH };
    }

    function upsampleBilinear(img, targetW, targetH) {
        const w = img.width;
        const h = img.height;
        const src = img.data;
        const dst = new Float32Array(targetW * targetH);
        for (let y = 0; y < targetH; y++) {
            const sj = 0.5 * y - 0.25;
            const sj0 = Math.floor(sj);
            const sj1 = Math.ceil(sj);
            const y0 = clamp(sj0, h) * w;
            const y1 = clamp(sj1, h) * w;
            const wy0 = sj1 - sj;
            const wy1 = sj - sj0;
            const outRow = y * targetW;
            for (let x = 0; x < targetW; x++) {
                const si = 0.5 * x - 0.25;
                const si0 = Math.floor(si);
                const si1 = Math.ceil(si);
                const x0 = clamp(si0, w);
                const x1 = clamp(si1, w);
                const wx0 = si1 - si;
                const wx1 = si - si0;
                dst[outRow + x] =
                    src[y0 + x0] * wx0 * wy0 +
                    src[y1 + x0] * wx0 * wy1 +
                    src[y0 + x1] * wx1 * wy0 +
                    src[y1 + x1] * wx1 * wy1;
            }
        }
        return { data: dst, width: targetW, height: targetH };
    }

    function differenceImage(imgA, imgB) {
        const len = imgA.data.length;
        const dst = new Float32Array(len);
        const a = imgA.data;
        const b = imgB.data;
        for (let i = 0; i < len; i++) {
            dst[i] = a[i] - b[i];
        }
        return { data: dst, width: imgA.width, height: imgA.height };
    }

    function buildExtremas(dog0Orig, dog1, dog2Orig) {
        const w = dog1.width;
        const h = dog1.height;
        const dog0 = downsampleBilinear(dog0Orig);
        const dog2 = upsampleBilinear(dog2Orig, w, h);
        const d0 = dog0.data;
        const d1 = dog1.data;
        const d2 = dog2.data;
        const w0 = dog0.width;
        const h0 = dog0.height;
        const out = new Float32Array(w * h);

        for (let y = 7; y <= h - 8; y++) {
            const row = y * w;
            for (let x = 7; x <= w - 8; x++) {
                const val = d1[row + x];
                if (val * val < 9.0) continue;

                let isMax = true;
                let isMin = true;
                for (let dy = -1; dy <= 1 && (isMax || isMin); dy++) {
                    const yy = y + dy;
                    const r1 = yy * w;
                    const r0 = clamp(yy, h0) * w0;
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx;
                        const v1 = d1[r1 + xx];
                        const v2 = d2[r1 + xx];
                        const v0 = d0[r0 + clamp(xx, w0)];
                        if (val < v0 || val < v1 || val < v2) isMax = false;
                        if (val > v0 || val > v1 || val > v2) isMin = false;
                    }
                }
                if (!isMax && !isMin) continue;

                const dxx = d1[row + x + 1] + d1[row + x - 1] - 2.0 * val;
                const dyy = d1[(y + 1) * w + x] + d1[(y - 1) * w + x] - 2.0 * val;
                const dxy = 0.25 * (d1[(y - 1) * w + x - 1] + d1[(y + 1) * w + x + 1] - d1[(y - 1) * w + x + 1] - d1[(y + 1) * w + x - 1]);
                const det = dxx * dyy - dxy * dxy;
                if (Math.abs(det) < 0.0001) continue;
                const edgeScore = ((dxx + dyy) * (dxx + dyy)) / det;
                if (Math.abs(edgeScore) >= 6.25) continue;

                out[row + x] = val;
            }
        }
        return { data: out, width: w, height: h };
    }

    function detectFeaturesCPU(greyImage) {
        let w = greyImage.width;
        let h = greyImage.height;
        let numOctaves = 0;
        while (w >= 8 && h >= 8) {
            w /= 2;
            h /= 2;
            numOctaves++;
            if (numOctaves === 5) break;
        }

        const pyramidImages = [];
        for (let i = 0; i < numOctaves; i++) {
            const img1 = (i === 0)
                ? applyBinomialFilter(greyImage)
                : downsampleBilinear(pyramidImages[i - 1][1]);
            const img2 = applyBinomialFilter(img1);
            pyramidImages.push([img1, img2]);
        }

        const dogPyramid = [];
        for (let i = 0; i < numOctaves; i++) {
            dogPyramid.push(differenceImage(pyramidImages[i][0], pyramidImages[i][1]));
        }

        const extremasList = [];
        for (let i = 1; i < numOctaves - 1; i++) {
            extremasList.push(buildExtremas(dogPyramid[i - 1], dogPyramid[i], dogPyramid[i + 1]));
        }

        // Prune: 100 cubetas (10x10), top 5 por cubeta
        const bucketScores = [];
        const bucketItems = [];
        for (let b = 0; b < 100; b++) {
            bucketScores.push([0, 0, 0, 0, 0]);
            bucketItems.push([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
        }

        for (let s = 0; s < extremasList.length; s++) {
            const ext = extremasList[s];
            const ew = ext.width;
            const eh = ext.height;
            const ed = ext.data;
            const outH = Math.floor(eh / 2);
            const outW = Math.floor(ew / 2);
            const octave = s + 1;
            const stepX = (2 * outW) / 10;
            const stepY = (2 * outH) / 10;

            for (let ry = 0; ry < outH; ry++) {
                const y = ry * 2;
                for (let rx = 0; rx < outW; rx++) {
                    const x = rx * 2;
                    let loc = 0;
                    let val = ed[y * ew + x];
                    if (y + 1 < eh && ed[(y + 1) * ew + x] !== 0) {
                        loc = 1;
                        val = ed[(y + 1) * ew + x];
                    } else if (x + 1 < ew && ed[y * ew + x + 1] !== 0) {
                        loc = 2;
                        val = ed[y * ew + x + 1];
                    } else if (y + 1 < eh && x + 1 < ew && ed[(y + 1) * ew + x + 1] !== 0) {
                        loc = 3;
                        val = ed[(y + 1) * ew + x + 1];
                    }
                    if (val === 0) continue;

                    const fx = x + (loc === 2 || loc === 3 ? 1 : 0);
                    const fy = y + (loc === 1 || loc === 3 ? 1 : 0);
                    const bx = Math.min(9, Math.max(0, Math.floor(fx / stepX)));
                    const by = Math.min(9, Math.max(0, Math.floor(fy / stepY)));
                    const bucketIdx = by * 10 + bx;
                    const absScore = Math.abs(val);
                    const scores = bucketScores[bucketIdx];
                    const items = bucketItems[bucketIdx];

                    let pos = 5;
                    while (pos >= 1 && absScore > scores[pos - 1]) pos--;
                    if (pos < 5) {
                        for (let k = 4; k >= pos + 1; k--) {
                            scores[k] = scores[k - 1];
                            items[k] = items[k - 1];
                        }
                        scores[pos] = absScore;
                        items[pos] = [val, octave, fy, fx];
                    }
                }
            }
        }

        const pruned = [];
        for (let b = 0; b < 100; b++) {
            for (let k = 0; k < 5; k++) {
                pruned.push(bucketItems[b][k]);
            }
        }

        // Localización subpíxel, orientación y FREAK para cada punto activo
        const featurePoints = [];
        for (let idx = 0; idx < pruned.length; idx++) {
            const pt = pruned[idx];
            const score = pt[0];
            if (score === 0) continue;

            const octave = Math.trunc(pt[1]);
            const dogImg = dogPyramid[octave];
            if (!dogImg) continue;
            const dw = dogImg.width;
            const dh = dogImg.height;
            const dd = dogImg.data;
            const iy = Math.trunc(pt[2]);
            const ix = Math.trunc(pt[3]);

            const getDog = (yy, xx) => dd[clamp(yy, dh) * dw + clamp(xx, dw)];
            const t00 = getDog(iy - 1, ix - 1), t01 = getDog(iy - 1, ix), t02 = getDog(iy - 1, ix + 1);
            const t10 = getDog(iy, ix - 1),     t11 = getDog(iy, ix),     t12 = getDog(iy, ix + 1);
            const t20 = getDog(iy + 1, ix - 1), t21 = getDog(iy + 1, ix), t22 = getDog(iy + 1, ix + 1);

            const dx = 0.5 * (t12 - t10);
            const dy = 0.5 * (t21 - t01);
            const dxx = t12 + t10 - 2 * t11;
            const dyy = t21 + t01 - 2 * t11;
            const dxy = 0.25 * (t00 + t22 - t02 - t20);
            const det = dxx * dyy - dxy * dxy;

            let locY = pt[2];
            let locX = pt[3];
            if (Math.abs(det) >= 1e-4) {
                const offX = (dyy * -dx + -dxy * -dy) / det;
                const offY = (-dxy * -dx + dxx * -dy) / det;
                locY += offY;
                locX += offX;
            }

            // Histograma de orientación (36 bins)
            const gImg = pyramidImages[octave][1];
            const gw = gImg.width;
            const gh = gImg.height;
            const gd = gImg.data;
            const getG = (yy, xx) => gd[clamp(yy, gh) * gw + clamp(xx, gw)];

            let hist = new Float32Array(ORIENTATION_NUM_BINS);
            const cy = Math.trunc(locY);
            const cx = Math.trunc(locX);
            const oneOver2PI = 0.159154943091895;

            for (let r = 0; r < RADIAL_LIST.length; r++) {
                const ry = RADIAL_LIST[r][0];
                const rx = RADIAL_LIST[r][1];
                const rw = RADIAL_LIST[r][2];
                const yp = cy + ry;
                const xp = cx + rx;
                const gdy = getG(yp + 1, xp) - getG(yp - 1, xp);
                const gdx = getG(yp, xp + 1) - getG(yp, xp - 1);
                const mag = Math.sqrt(gdx * gdx + gdy * gdy) * rw;
                const angle = Math.atan2(gdy, gdx) + Math.PI;
                const fbin = angle * ORIENTATION_NUM_BINS * oneOver2PI;
                const bin = Math.trunc(Math.floor(fbin - 0.5));
                const b1 = ((bin % ORIENTATION_NUM_BINS) + ORIENTATION_NUM_BINS) % ORIENTATION_NUM_BINS;
                const b2 = (((bin + 1) % ORIENTATION_NUM_BINS) + ORIENTATION_NUM_BINS) % ORIENTATION_NUM_BINS;
                const w2 = fbin - bin - 0.5;
                const w1 = 1.0 - w2;
                hist[b1] += w1 * mag;
                hist[b2] += w2 * mag;
            }

            // Suavizado del histograma (5 iteraciones)
            for (let it = 0; it < 5; it++) {
                const nextHist = new Float32Array(ORIENTATION_NUM_BINS);
                for (let b = 0; b < ORIENTATION_NUM_BINS; b++) {
                    const prev = (b - 1 + ORIENTATION_NUM_BINS) % ORIENTATION_NUM_BINS;
                    const next = (b + 1) % ORIENTATION_NUM_BINS;
                    nextHist[b] = 0.274068619061197 * hist[prev] + 0.451862761877606 * hist[b] + 0.274068619061197 * hist[next];
                }
                hist = nextHist;
            }

            let maxBin = 0;
            for (let b = 1; b < ORIENTATION_NUM_BINS; b++) {
                if (hist[b] > hist[maxBin]) maxBin = b;
            }
            const prevBin = (maxBin - 1 + ORIENTATION_NUM_BINS) % ORIENTATION_NUM_BINS;
            const nextBin = (maxBin + 1) % ORIENTATION_NUM_BINS;
            const p10 = maxBin - 1, p11 = hist[prevBin];
            const p20 = maxBin,     p21 = hist[maxBin];
            const p30 = maxBin + 1, p31 = hist[nextBin];
            const d1 = (p30 - p20) * (p30 - p10);
            const d2 = (p10 - p20) * (p30 - p10);
            const d3 = p10 - p20;
            let fbinPeak = maxBin;
            if (Math.abs(d1) > 1e-5 && Math.abs(d2) > 1e-5 && Math.abs(d3) > 1e-5) {
                let A = ((p31 - p21) / d1) - ((p11 - p21) / d2);
                if (Number.isNaN(A) || A === 0) A = 1e-5;
                const B = ((p11 - p21) + A * (p20 * p20 - p10 * p10)) / d3;
                fbinPeak = -B / (2.0 * A);
                if (Number.isNaN(fbinPeak)) fbinPeak = maxBin;
            }
            const angleFinal = 2.0 * Math.PI * (fbinPeak + 0.5) / ORIENTATION_NUM_BINS - Math.PI;

            // Muestreo FREAK (37 puntos)
            const cos = 7.0 * Math.cos(angleFinal);
            const sin = 7.0 * Math.sin(angleFinal);
            const freakSamples = new Float32Array(NUM_FREAK_POINTS);
            for (let f = 0; f < NUM_FREAK_POINTS; f++) {
                const fx = FREAKPOINTS[f][1];
                const fy = FREAKPOINTS[f][2];
                const yp = locY + fx * sin + fy * cos;
                const xp = locX + fx * cos - fy * sin;
                const x0 = Math.trunc(Math.floor(xp));
                const x1 = x0 + 1;
                const y0 = Math.trunc(Math.floor(yp));
                const y1 = y0 + 1;
                const f1 = getG(y0, x0);
                const f2 = getG(y0, x1);
                const f3 = getG(y1, x0);
                const f4 = getG(y1, x1);
                freakSamples[f] =
                    (x1 - xp) * (y1 - yp) * f1 +
                    (xp - x0) * (y1 - yp) * f2 +
                    (x1 - xp) * (yp - y0) * f3 +
                    (xp - x0) * (yp - y0) * f4;
            }

            // Descriptores binarios FREAK (84 bytes -> 21 enteros de 32 bits)
            const descBytes = new Uint8Array(DESCRIPTOR_BYTES);
            for (let dIdx = 0; dIdx < DESCRIPTOR_BYTES; dIdx++) {
                const base = dIdx * 8;
                let byteVal = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const pairIdx = base + bit;
                    if (pairIdx >= FREAK_COMPARISON_COUNT) continue;
                    const v1 = freakSamples[FREAK_PAIRS_P1[pairIdx]];
                    const v2 = freakSamples[FREAK_PAIRS_P2[pairIdx]];
                    if (v1 < v2 + 0.01) {
                        byteVal |= (1 << (7 - bit));
                    }
                }
                descBytes[dIdx] = byteVal;
            }

            const descriptors32 = [];
            for (let n = 0; n < DESCRIPTOR_BYTES; n += 4) {
                descriptors32.push(
                    descBytes[n] * 16777216 +
                    descBytes[n + 1] * 65536 +
                    descBytes[n + 2] * 256 +
                    descBytes[n + 3]
                );
            }

            const pow2 = Math.pow(2, octave);
            const halfPow2 = Math.pow(2, octave - 1) - 0.5;
            featurePoints.push({
                maxima: score > 0,
                x: locX * pow2 + halfPow2,
                y: locY * pow2 + halfPow2,
                scale: pow2,
                angle: angleFinal,
                descriptors: descriptors32
            });
        }

        return featurePoints;
    }

    // 4. Clustering Jerárquico (Exactamente igual al módulo 723 de MindAR)
    function popcount32(x) {
        x = x - ((x >> 1) & 0x55555555);
        x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
        x = (x + (x >> 4)) & 0x0f0f0f0f;
        x = x + (x >> 8);
        x = x + (x >> 16);
        return x & 0x0000003f;
    }

    function hammingCompute(v1, v2) {
        let sum = 0;
        for (let i = 0; i < v1.length; i++) {
            sum += popcount32((v1[i] ^ v2[i]) >>> 0);
        }
        return sum;
    }

    function createRandomizer() {
        return {
            seed: 1234,
            arrayShuffle(arr, sampleSize) {
                for (let i = 0; i < sampleSize; i++) {
                    this.seed = (214013 * this.seed + 2531011) % 2147483648;
                    let r = (this.seed >> 16) & 32767;
                    r = r % arr.length;
                    const tmp = arr[i];
                    arr[i] = arr[r];
                    arr[r] = tmp;
                }
            }
        };
    }

    function buildClusterNode(points, pointIndexes, centerPointIndex, randomizer) {
        let isLeaf = (pointIndexes.length <= 16);
        const groups = {};

        if (!isLeaf) {
            const idxArr = [];
            for (let i = 0; i < pointIndexes.length; i++) idxArr.push(i);
            let bestDist = Number.MAX_SAFE_INTEGER;
            let bestAssignment = null;

            for (let t = 0; t < 32; t++) {
                randomizer.arrayShuffle(idxArr, 8);
                let totalDist = 0;
                const assign = new Int32Array(pointIndexes.length);
                for (let i = 0; i < pointIndexes.length; i++) {
                    let minD = Number.MAX_SAFE_INTEGER;
                    const descI = points[pointIndexes[i]].descriptors;
                    for (let k = 0; k < 8; k++) {
                        const centerIdx = pointIndexes[idxArr[k]];
                        const d = hammingCompute(descI, points[centerIdx].descriptors);
                        if (d < minD) {
                            minD = d;
                            assign[i] = idxArr[k];
                        }
                    }
                    totalDist += minD;
                }
                if (totalDist < bestDist) {
                    bestDist = totalDist;
                    bestAssignment = assign;
                }
            }

            for (let i = 0; i < bestAssignment.length; i++) {
                const centerKey = pointIndexes[bestAssignment[i]];
                if (!groups[centerKey]) groups[centerKey] = [];
                groups[centerKey].push(pointIndexes[i]);
            }
            if (Object.keys(groups).length === 1) isLeaf = true;
        }

        const node = { centerPointIndex: centerPointIndex };
        if (isLeaf) {
            node.leaf = true;
            node.pointIndexes = pointIndexes.slice();
            return node;
        }
        node.leaf = false;
        node.children = [];
        Object.keys(groups).forEach(k => {
            node.children.push(buildClusterNode(points, groups[k], Number(k), randomizer));
        });
        return node;
    }

    function buildHierarchicalCluster(points) {
        const idxs = [];
        for (let i = 0; i < points.length; i++) idxs.push(i);
        return { rootNode: buildClusterNode(points, idxs, null, createRandomizer()) };
    }

    // 5. Extracción de Características de Seguimiento (Módulo 589 de MindAR)
    class Cumsum2D {
        constructor(data, width, height) {
            this.width = width;
            this.height = height;
            this.sums = new Float64Array(width * height);
            this.sums[0] = data[0];
            for (let x = 1; x < width; x++) {
                this.sums[x] = this.sums[x - 1] + data[x];
            }
            for (let y = 1; y < height; y++) {
                this.sums[y * width] = this.sums[(y - 1) * width] + data[y * width];
            }
            for (let y = 1; y < height; y++) {
                const row = y * width;
                const prevRow = (y - 1) * width;
                for (let x = 1; x < width; x++) {
                    this.sums[row + x] = data[row + x] + this.sums[prevRow + x] + this.sums[row + x - 1] - this.sums[prevRow + x - 1];
                }
            }
        }
        query(x1, y1, x2, y2) {
            const w = this.width;
            let res = this.sums[y2 * w + x2];
            if (y1 > 0) res -= this.sums[(y1 - 1) * w + x2];
            if (x1 > 0) res -= this.sums[y2 * w + (x1 - 1)];
            if (x1 > 0 && y1 > 0) res += this.sums[(y1 - 1) * w + (x1 - 1)];
            return res;
        }
    }

    function patchStd(image, cx, cy, sdThresh, cumsum, sqrCumsum) {
        if (cx - 6 < 0 || cx + 6 >= image.width || cy - 6 < 0 || cy + 6 >= image.height) return null;
        const mean = cumsum.query(cx - 6, cy - 6, cx + 6, cy + 6) / 169;
        let v = sqrCumsum.query(cx - 6, cy - 6, cx + 6, cy + 6);
        v -= 2 * mean * cumsum.query(cx - 6, cy - 6, cx + 6, cy + 6);
        v += 169 * mean * mean;
        if (v / 169 < sdThresh * sdThresh) return null;
        return Math.sqrt(Math.max(0, v));
    }

    function patchSim(image, cx, cy, vlen, tx, ty, cumsum, sqrCumsum) {
        const w = image.width;
        const h = image.height;
        const data = image.data;
        if (cx - 6 < 0 || cx + 6 >= w || cy - 6 < 0 || cy + 6 >= h) return null;
        const cSum = cumsum.query(cx - 6, cy - 6, cx + 6, cy + 6);
        const cSqr = sqrCumsum.query(cx - 6, cy - 6, cx + 6, cy + 6);
        let dot = 0;
        let d = (cy - 6) * w + (cx - 6);
        let p = (ty - 6) * w + (tx - 6);
        const step = w - 13;
        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                dot += data[d] * data[p];
                d++;
                p++;
            }
            d += step;
            p += step;
        }
        const tMean = cumsum.query(tx - 6, ty - 6, tx + 6, ty + 6) / 169;
        dot -= tMean * cSum;
        const denom = cSqr - (cSum * cSum) / 169;
        if (denom <= 0) return null;
        return dot / (vlen * Math.sqrt(denom));
    }

    function extractTrackingPoints(image) {
        const data = image.data;
        const w = image.width;
        const h = image.height;
        const isCandidate = new Uint8Array(w * h);
        const grad = new Float32Array(w * h);

        for (let x = 0; x < w; x++) {
            grad[x] = -1;
            grad[(h - 1) * w + x] = -1;
        }
        for (let y = 0; y < h; y++) {
            grad[y * w] = -1;
            grad[y * w + w - 1] = -1;
        }

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                let gx = 0, gy = 0;
                for (let k = -1; k <= 1; k++) {
                    gx += data[idx + w * k + 1] - data[idx + w * k - 1];
                    gy += data[idx + w + k] - data[idx - w + k];
                }
                gx /= 768;
                gy /= 768;
                grad[idx] = Math.sqrt((gx * gx + gy * gy) / 2);
            }
        }

        const hist = new Uint32Array(1000);
        const offsets = [-1, 1, -w, w];
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const val = grad[idx];
                if (val > grad[idx - 1] && val > grad[idx + 1] && val > grad[idx - w] && val > grad[idx + w]) {
                    let bin = Math.floor(1000 * val);
                    if (bin > 999) bin = 999;
                    if (bin < 0) bin = 0;
                    hist[bin]++;
                    isCandidate[idx] = 1;
                }
            }
        }

        const maxPoints = 0.02 * w * h;
        let threshBin = 999;
        let acc = 0;
        while (threshBin >= 0) {
            acc += hist[threshBin];
            if (acc > maxPoints) break;
            threshBin--;
        }

        for (let i = 0; i < isCandidate.length; i++) {
            if (isCandidate[i] && 1000 * grad[i] < threshBin) {
                isCandidate[i] = 0;
            }
        }

        const sqrData = new Float64Array(data.length);
        for (let i = 0; i < data.length; i++) sqrData[i] = data[i] * data[i];
        const cumsum = new Cumsum2D(data, w, h);
        const sqrCumsum = new Cumsum2D(sqrData, w, h);
        const featureMap = new Float32Array(data.length);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (!isCandidate[idx]) {
                    featureMap[idx] = 1;
                    continue;
                }
                const vlen = patchStd(image, x, y, 5, cumsum, sqrCumsum);
                if (vlen === null) {
                    featureMap[idx] = 1;
                    continue;
                }
                let maxSim = -1;
                for (let dy = -10; dy <= 10; dy++) {
                    for (let dx = -10; dx <= 10; dx++) {
                        if (dx * dx + dy * dy <= 4) continue;
                        const sim = patchSim(image, x + dx, y + dy, vlen, x, y, cumsum, sqrCumsum);
                        if (sim !== null && sim > maxSim) {
                            maxSim = sim;
                            if (maxSim > 0.95) break;
                        }
                    }
                    if (maxSim > 0.95) break;
                }
                featureMap[idx] = maxSim;
            }
        }

        // Selección final de puntos de tracking
        const occSize = Math.floor(Math.min(w, h) / 10);
        const templateSize = 6;
        const searchSize = 2;
        const maxSimThresh = 0.9;
        const minSimThresh = 0.2;
        const sdThresh = 8;
        const blockW = 3 * (2 * templateSize + 1);
        const targetCount = Math.floor(w / occSize) * Math.floor(h / occSize) + Math.floor(w / blockW) * Math.floor(h / blockW);
        const selected = [];
        const fmap = new Float32Array(featureMap);

        while (selected.length < targetCount) {
            let bestVal = maxSimThresh;
            let bestX = -1;
            let bestY = -1;
            for (let y = 0; y < h; y++) {
                const row = y * w;
                for (let x = 0; x < w; x++) {
                    if (fmap[row + x] < bestVal) {
                        bestVal = fmap[row + x];
                        bestX = x;
                        bestY = y;
                    }
                }
            }
            if (bestX === -1) break;

            const vlen = patchStd(image, bestX, bestY, 0, cumsum, sqrCumsum);
            if (vlen === null || vlen / (2 * templateSize + 1) < sdThresh) {
                fmap[bestY * w + bestX] = 1;
                continue;
            }

            let minS = 1, maxS = -1;
            for (let dy = -searchSize; dy <= searchSize; dy++) {
                for (let dx = -searchSize; dx <= searchSize; dx++) {
                    if (dx * dx + dy * dy > searchSize * searchSize || (dx === 0 && dy === 0)) continue;
                    const sim = patchSim(image, bestX + dx, bestY + dy, vlen, bestX, bestY, cumsum, sqrCumsum);
                    if (sim !== null) {
                        if (sim < minS) minS = sim;
                        if (sim > maxS) maxS = sim;
                    }
                }
            }

            if ((minS < minSimThresh && minS < bestVal) || maxS > 0.99) {
                fmap[bestY * w + bestX] = 1;
            } else {
                selected.push({ x: bestX, y: bestY });
                for (let dy = -occSize; dy <= occSize; dy++) {
                    const yy = bestY + dy;
                    if (yy < 0 || yy >= h) continue;
                    for (let dx = -occSize; dx <= occSize; dx++) {
                        const xx = bestX + dx;
                        if (xx >= 0 && xx < w) fmap[yy * w + xx] = 1;
                    }
                }
            }
        }
        return selected;
    }

    // 6. Codificador MsgPack ligero para exportar { v: 2, dataList } compatible 100% con MindAR
    function encodeMsgPack(val) {
        const chunks = [];
        const textEncoder = new TextEncoder();

        function pushByte(b) {
            chunks.push(new Uint8Array([b & 0xff]));
        }
        function pushU16(v) {
            chunks.push(new Uint8Array([(v >>> 8) & 0xff, v & 0xff]));
        }
        function pushU32(v) {
            chunks.push(new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]));
        }
        function pushI32(v) {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setInt32(0, v, false);
            chunks.push(new Uint8Array(buf));
        }
        function pushF64(v) {
            const buf = new ArrayBuffer(9);
            const dv = new DataView(buf);
            dv.setUint8(0, 0xcb);
            dv.setFloat64(1, v, false);
            chunks.push(new Uint8Array(buf));
        }

        function pack(v) {
            if (v === null || v === undefined) {
                pushByte(0xc0);
            } else if (typeof v === 'boolean') {
                pushByte(v ? 0xc3 : 0xc2);
            } else if (typeof v === 'number') {
                if (Number.isInteger(v) && v >= -2147483648 && v <= 4294967295) {
                    if (v >= 0) {
                        if (v <= 0x7f) pushByte(v);
                        else if (v <= 0xff) { pushByte(0xcc); pushByte(v); }
                        else if (v <= 0xffff) { pushByte(0xcd); pushU16(v); }
                        else { pushByte(0xce); pushU32(v); }
                    } else {
                        if (v >= -32) pushByte(0xe0 | (v + 32));
                        else if (v >= -128) { pushByte(0xd0); pushByte(v & 0xff); }
                        else if (v >= -32768) { pushByte(0xd1); pushU16(v & 0xffff); }
                        else { pushByte(0xd2); pushI32(v); }
                    }
                } else {
                    pushF64(v);
                }
            } else if (typeof v === 'string') {
                const strBytes = textEncoder.encode(v);
                const len = strBytes.length;
                if (len <= 31) pushByte(0xa0 | len);
                else if (len <= 0xff) { pushByte(0xd9); pushByte(len); }
                else if (len <= 0xffff) { pushByte(0xda); pushU16(len); }
                else { pushByte(0xdb); pushU32(len); }
                chunks.push(strBytes);
            } else if (v instanceof Uint8Array) {
                const len = v.byteLength;
                if (len <= 0xff) { pushByte(0xc4); pushByte(len); }
                else if (len <= 0xffff) { pushByte(0xc5); pushU16(len); }
                else { pushByte(0xc6); pushU32(len); }
                chunks.push(v);
            } else if (Array.isArray(v)) {
                const len = v.length;
                if (len <= 15) pushByte(0x90 | len);
                else if (len <= 0xffff) { pushByte(0xdc); pushU16(len); }
                else { pushByte(0xdd); pushU32(len); }
                for (let i = 0; i < len; i++) pack(v[i]);
            } else if (typeof v === 'object') {
                const keys = Object.keys(v);
                const len = keys.length;
                if (len <= 15) pushByte(0x80 | len);
                else if (len <= 0xffff) { pushByte(0xde); pushU16(len); }
                else { pushByte(0xdf); pushU32(len); }
                for (let i = 0; i < len; i++) {
                    const k = keys[i];
                    pack(k);
                    pack(v[k]);
                }
            }
        }

        pack(val);

        let totalLen = 0;
        for (let i = 0; i < chunks.length; i++) totalLen += chunks[i].byteLength;
        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
            out.set(chunks[i], offset);
            offset += chunks[i].byteLength;
        }
        return out;
    }

    // 7. Función principal asíncrona con reporte de progreso real de 0% a 100%
    async function compileImageToMindBuffer(greyTargetImage, onProgress) {
        const report = (p) => {
            if (typeof onProgress === 'function') onProgress(Math.min(100, Math.max(0, Math.round(p))));
        };

        report(5);
        const imageList = buildImageList(greyTargetImage);
        const matchingData = [];

        for (let i = 0; i < imageList.length; i++) {
            await new Promise(r => setTimeout(r, 15));
            const img = imageList[i];
            const ps = detectFeaturesCPU(img);
            const maximaPoints = ps.filter(p => p.maxima);
            const minimaPoints = ps.filter(p => !p.maxima);
            const maximaPointsCluster = buildHierarchicalCluster(maximaPoints);
            const minimaPointsCluster = buildHierarchicalCluster(minimaPoints);

            matchingData.push({
                maximaPoints,
                minimaPoints,
                maximaPointsCluster,
                minimaPointsCluster,
                width: img.width,
                height: img.height,
                scale: img.scale
            });
            report(8 + ((i + 1) / imageList.length) * 52); // 8% -> 60%
        }

        const trackingImageList = buildTrackingImageList(greyTargetImage);
        const trackingData = [];
        for (let i = 0; i < trackingImageList.length; i++) {
            await new Promise(r => setTimeout(r, 15));
            const tImg = trackingImageList[i];
            const pts = extractTrackingPoints(tImg);
            trackingData.push({
                data: tImg.data,
                scale: tImg.scale,
                width: tImg.width,
                height: tImg.height,
                points: pts
            });
            report(60 + ((i + 1) / trackingImageList.length) * 35); // 60% -> 95%
        }

        await new Promise(r => setTimeout(r, 10));
        const mindPayload = {
            v: 2,
            dataList: [
                {
                    targetImage: {
                        width: greyTargetImage.width,
                        height: greyTargetImage.height
                    },
                    trackingData: trackingData,
                    matchingData: matchingData
                }
            ]
        };

        const encoded = encodeMsgPack(mindPayload);
        report(100);
        return encoded;
    }

    globalScope.MindCompilerCPU = {
        compileImageToMindBuffer
    };
})(typeof window !== 'undefined' ? window : globalThis);
