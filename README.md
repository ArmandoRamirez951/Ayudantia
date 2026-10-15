```mermaid
flowchart TD
    %% Definición de Estilos por Rol / Fase
    classDef chofer fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef supervisor fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef taller fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef admin fill:#4f46e5,stroke:#4338ca,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef corp fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef condicion fill:#1e293b,stroke:#475569,stroke-width:2px,color:#f8fafc,font-weight:bold;
    classDef exito fill:#16a34a,stroke:#15803d,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef cierre fill:#0f172a,stroke:#334155,stroke-width:3px,color:#38bdf8,font-weight:bold;
    classDef caja fill:#f8fafc,stroke:#cbd5e1,stroke-width:2px,color:#1e293b,font-weight:bold;

    %% FASE 1: INICIO Y COTIZACIÓN (Izquierda a Derecha)
    subgraph F1 ["1️⃣ FASE 1: INGRESO Y DIAGNÓSTICO"]
        direction LR
        A(["🚗 1. Chofer: Reporte<br/><small>Correo, firma y COPE</small>"]):::chofer --> B["📋 2. Supervisor: Asigna<br/><small>Notifica al Taller</small>"]:::supervisor --> C["🔧 3. Taller: Cotiza<br/><small>Refacciones y fotos</small>"]:::taller
    end

    %% FASE 2: AUTORIZACIÓN PRESUPUESTAL (Izquierda a Derecha)
    subgraph F2 ["2️⃣ FASE 2: FILTRO Y AUTORIZACIÓN PRESUPUESTAL"]
        direction LR
        D{"💰 4. Filtro<br/>Presupuestal"}:::condicion
        E1["✅ Aprueba Supervisor<br/><small>(Ruta Ordinaria)</small>"]:::supervisor
        E2["🛡️ Visto Bueno Admin<br/><small>(Revisión +$10k)</small>"]:::admin
        E3["🏢 Aprueba Corporativos<br/><small>(🔒 Sin Cobertura Corp)</small>"]:::corp
        F["📄 5. Orden Oficial<br/><small>Inicia reparación</small>"]:::taller

        D -- "≤ $10,000" --> E1 -->
