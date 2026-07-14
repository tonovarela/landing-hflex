# Registro de Asistencia — Semana Flexible

Plantilla web ligera (HTML + Vanilla JS + Tailwind CSS vía CDN) para mostrar el registro de asistencia semanal de un colaborador: perfil, resumen de la semana flexible y detalle de entradas/salidas por día.

No requiere build ni dependencias: es un único archivo `index.html` que se abre directamente en el navegador.

## Características

- **Perfil del colaborador**: avatar, nombre, puesto, vacaciones y faltas.
- **Resumen semanal**: barra de progreso, porcentaje de cumplimiento y estadísticas (horas esperadas, vacaciones, faltas, retardos, salidas anticipadas y total registradas).
- **Tabla de asistencia**: entrada, salida y total por día. Se convierte automáticamente en tarjetas apiladas en pantallas pequeñas.
- **Modo oscuro / claro**: selector en la cabecera con persistencia en `localStorage` y sin parpadeo al recargar (respeta la preferencia del sistema como valor inicial).
- **Responsivo**: diseñado con Tailwind para adaptarse de móvil a escritorio.
- **Estados de la interfaz**: carga (skeletons), error de conexión (con reintento) y colaborador no encontrado.
- **Listo para consumir un API**: hoy usa datos de ejemplo (mock); solo hay que configurar la URL del servicio.

## Uso

El `id` del colaborador se pasa como **query parameter** en la URL:

```
index.html?id=16407
```

Ese mismo `id` es el que se envía al API.

| URL                    | Resultado                                  |
| ---------------------- | ------------------------------------------ |
| `index.html?id=16407`  | Muestra los datos del colaborador          |
| `index.html?id=99999`  | Sección "Colaborador no encontrado" (404)  |
| `index.html`           | Sección "Falta el identificador"           |

Para probar localmente basta con abrir el archivo en el navegador, o servirlo con cualquier servidor estático:

```bash
# Opción con Python
python3 -m http.server 8080
# luego abrir: http://localhost:8080/index.html?id=16407
```

## Conexión con el API

La configuración está centralizada en el objeto `API_CONFIG`, dentro de `index.html`:

```js
const API_CONFIG = {
    baseUrl: null,                    // p.ej. 'https://api.tuempresa.com' · null = usa mocks
    endpoints: {
        asistencia: '/asistencia'     // GET ?id=..&semana=..
    },
    queryParam: 'id',                 // nombre del parámetro en la URL de la página
    headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer ' + TOKEN,
    }
};
```

- Mientras `baseUrl` sea `null`, la plantilla usa los datos de ejemplo (`MOCK_ASISTENCIA`).
- Al definir `baseUrl`, la función `fetchData()` hará la petición real:

  ```
  GET  {baseUrl}/asistencia?id=16407
  ```

- El servicio debe responder **HTTP 404** cuando el colaborador no exista, para que se muestre la sección correspondiente. Cualquier otro fallo muestra el banner de error.

### Formato de respuesta esperado

El API debe devolver un JSON con esta estructura (idéntica al mock incluido):

```json
{
  "perfil": {
    "nombre": "ULISES GUZMAN MARES",
    "puesto": "CUENTAS POR PAGAR",
    "avatar": "https://.../foto.png",
    "enLinea": true,
    "vacaciones": -2.0,
    "faltas": 0
  },
  "semana": {
    "titulo": "Semana Flexible 28",
    "porcentaje": 100.0,
    "horasRegistradas": 47.65,
    "horasEsperadas": 47.5,
    "stats": {
      "horasEsperadas": "47 h 30 m",
      "horasVacaciones": "0 h 0 m",
      "faltas": -4,
      "retardos": 0,
      "salidasAnticipadas": 0,
      "totalRegistradas": "47 h 39 m"
    }
  },
  "registros": [
    {
      "dia": "Lunes",
      "entrada": "06/07/2026 08:54",
      "salida": "06/07/2026 18:38",
      "total": "9 h 44 m"
    }
  ]
}
```

> En los días sin registro, `entrada` y `salida` pueden ser `null`; se mostrarán como `—`.

## Estructura del proyecto

```
landing-hflex/
├── index.html   # Plantilla completa (markup + estilos + lógica)
└── README.md
```

Dentro de `index.html` la lógica está organizada en secciones comentadas:

- **Tema**: alternar y persistir el modo oscuro/claro.
- **API_CONFIG**: configuración del servicio.
- **Obtención de datos** (`fetchData`): punto de conexión con el API.
- **Estado y flujo** (`loadData`, `getColaboradorId`): orquesta la carga.
- **Renderizado** (`renderProfile`, `renderWeek`, `renderRecords`): pinta la interfaz.

## Personalización

- **Nombre del query param**: cambia `API_CONFIG.queryParam` (por defecto `id`).
- **Colores de marca**: ajusta `brand.green` en `tailwind.config` dentro del `<head>`.
- **Autenticación**: descomenta la cabecera `Authorization` en `API_CONFIG.headers`.

## Tecnologías

- HTML5
- JavaScript (Vanilla, sin dependencias)
- [Tailwind CSS](https://tailwindcss.com/) vía CDN (`darkMode: 'class'`)
