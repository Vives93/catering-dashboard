# Catering · Gestión Operativa

Dashboard operativo para gestión de pedidos de catering. Funciona offline con sincronización automática.

## Stack
- HTML + Vanilla JS (sin frameworks)
- Firebase Firestore (base de datos + caché offline)
- Firebase Hosting (publicación)
- GitHub Actions (deploy automático)

## Estructura
```
catering/
├── index.html          # App principal
├── css/
│   └── style.css       # Estilos
├── js/
│   ├── firebase.js     # Conexión y helpers de Firestore
│   ├── importer.js     # Parser de CSV + lógica de importación
│   ├── dashboard.js    # Vistas: hoy, semana, mes, acumulado
│   └── app.js          # Controlador principal (eventos, modales)
├── firebase.json       # Config Firebase Hosting
├── .firebaserc         # Proyecto Firebase
└── .github/
    └── workflows/
        └── deploy.yml  # CI/CD automático
```

## Setup inicial

### 1. Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### 2. Reglas de Firestore
En la consola de Firebase → Firestore → Reglas, pegar:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /catering_orders/{doc} {
      allow read, write: if true; // Cambiar cuando añadas autenticación
    }
    match /catering_config/{doc} {
      allow read, write: if true;
    }
  }
}
```

### 3. Deploy manual (primera vez)
```bash
firebase deploy --only hosting
```

### 4. GitHub Actions (deploys automáticos)
1. Ir a Firebase Console → Hosting → GitHub Action
2. Conectar el repo de GitHub
3. Copiar el secret `FIREBASE_SERVICE_ACCOUNT` en GitHub → Settings → Secrets

A partir de ahí, cada push a `main` despliega automáticamente.

## Uso

### Importar CSV
1. Exportar el listado desde el sistema de catering
2. Clic en "Importar CSV"
3. Subir el archivo
4. Revisar el resumen (nuevos vs actualizados)
5. Confirmar

El sistema detecta automáticamente qué pedidos son nuevos y cuáles ya existían.

### Añadir pedido manual
Para pedidos ad-hoc que no pasan por el sistema:
1. Clic en "Añadir"
2. Rellenar el formulario
3. Guardar

### Alertas automáticas
- 🔴 **Rojo**: solapamiento de sala, >50 pax en un servicio, >100 pax acumulados en el día
- 🟡 **Ámbar**: 30-50 pax en un servicio
- 🟢 **Verde**: pedidos nuevos en la última importación

Los umbrales son configurables en `js/firebase.js` → `defaultConfig()`.
