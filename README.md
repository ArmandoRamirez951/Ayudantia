```mermaid
flowchart LR
    %% Definición de Estilos por Rol / Fase
    classDef chofer fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef supervisor fill:#0d9488,stroke:#0f766e,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef taller fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef admin fill:#4f46e5,stroke:#4338ca,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef corp fill:#7c3aed,stroke:#6d28d9,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef condicion fill:#1e293b,stroke:#475569,stroke-width:2px,color:#f8fafc,font-weight:bold;
    classDef exito fill:#16a34a,stroke:#15803d,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef cierre fill:#0f172a,stroke:#334155,stroke-width:3px,color:#38bdf8,font-weight:bold;
    classDef carril fill:#f8fafc,stroke:#94a3b8,stroke-width:2px,color:#0f172a,font-weight:bold;

    %% CARRIL SUPERIOR: INGRESO, PRESUPUESTO Y REPARACIÓN
    subgraph C1 ["➡️ PARTE 1: INGRESO, AUTORIZACIÓN Y TALLER (Izquierda a Derecha)"]
        direction LR
        A(["🚗 1. Chofer<br/>Reporte Inicio"]):::chofer --> B["📋 2. Supervisor<br/>Asigna Taller"]:::supervisor --> C["🔧 3. Taller<br/>Cotización y Fotos"]:::taller --> D{"💰 4. Filtro<br/>$10,000"}:::condicion
        
        D -- "≤ $10k" --> E1["✅ Aprueba Sup.<br/>(Ordinario)"]:::supervisor
        D -- "> $10k" --> E2["🛡️ VoBo Admin<br/>(+10k)"]:::admin --> E3["🏢 Aprueba Corp<br/>(🔒 Sin Suplencia)"]:::corp
        
        E1 --> F["📄 5. Orden Oficial<br/>Reparación Física"]:::taller
        E3 --> F
        F --> G["🔔 6. Taller: Lista<br/>Envía PIN a Chofer"]:::taller
    end

    %% CARRIL INFERIOR: ENTREGA SEGURA, FACTURACIÓN PDF Y SAP
    subgraph C2 ["➡️ PARTE 2: ENTREGA CON PIN, FACTURA PDF Y CIERRE SAP (Izquierda a Derecha)"]
        direction LR
        H(["🔐 7. Chofer en Taller<br/>Dicta PIN 8 dígitos"]):::chofer --> I["🚙 8. Entregada<br/>codigo_validado"]:::exito --> J["📑 9. Taller<br/>Sube Factura PDF"]:::taller --> K["🔎 10. Supervisor<br/>Valida Factura PDF"]:::supervisor --> L["🔓 11. Admin<br/>Libera Ticket"]:::admin --> M["💼 12. Jefatura/Sup<br/>Captura Doc 50 SAP"]:::supervisor --> N(["🗄️ 13. Archivo<br/>Histórico JSON"]):::cierre
    end

    %% Conexión entre Parte 1 y Parte 2
    G --> H

    class C1,C2 carril;
```
