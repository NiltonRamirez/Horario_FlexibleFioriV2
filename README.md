# Horario Flexible Fiori V2

Aplicacion SAPUI5 para planificacion semanal de trabajo (lunes a viernes), integrada con SAP SuccessFactors Employee Central mediante SAP CPI (endpoints REST), consumidos a traves de SAP BTP Destination.

## Resumen funcional

La aplicacion permite que un colaborador planifique su semana laboral segun reglas de negocio:

- Carga de contexto semanal desde un punto de acceso principal.
- Edicion solo si la semana es editable (`editable = true`).
- Bloqueo automatico de dias festivos o ausencias (`locked = true`).
- Visualizacion de datos previamente guardados si existen (`weekStatus = SAVED`).
- Guardado de la semana completa en un solo POST.

## Arquitectura

- Backend: SAP SuccessFactors Employee Central.
- Middleware: SAP CPI (REST endpoints).
- Frontend: SAPUI5 / Fiori freestyle.
- Conectividad: SAP BTP Destination obligatorio.

### Destination SAP BTP

Todos los servicios deben consumirse usando el destination:

- `dest_int_s`

No consumir directamente URLs hardcodeadas en produccion; usar rutas relativas proxificadas por destination.

## Estructura esperada de UI

Formulario principal con:

- Seccion de encabezado (datos del colaborador/contexto).
- Tres tablas o secciones funcionales equivalentes para:
- Planeacion diaria (lunes a viernes).
- Seleccion de sede (cuando aplica presencial).
- Seleccion de horario y resumen/eventos.

Comportamiento visual requerido:

- Dias de lunes a viernes en una sola columna (o layout equivalente por fila diaria).
- Frente a cada dia, selector de modo de trabajo.
- Si es presencial: habilitar sede y horario.
- Si es teletrabajo: habilitar solo horario.
- Si es festivo o ausencia: mostrar evento (nombre del festivo/ausencia) y bloquear edicion.

## Reglas de negocio

- `week-context` define si la semana es editable (`editable`) y cuales dias estan bloqueados (`locked`).
- Dias con `isHoliday = true` o `isAbsent = true` deben enviarse con `workMode` fijo:
- Festivo: `FESTIVO`
- Ausencia: `AUSENCIA`
- Para dias editables no bloqueados, el usuario elige:
- `PRESENCIAL` o `TELETRABAJO`
- `location` y `schedule` se envian por codigo (no por nombre).
- Botones:
- Guardar: envia la semana completa.
- Limpiar/Recargar: restablece solo campos editables recargando contexto, sin afectar bloqueados.

## Endpoints (via destination)

> Base CPI de referencia:
> `https://ccb-is-dev-5v6vds1v.it-cpi034-rt.cfapps.us10-002.hana.ondemand.com/http/workplan`

### 1) Contexto de interfaz

- Metodo: `GET`
- Ruta: `/employee-context?userId=10000`
- Uso: datos de encabezado (area, pais, nombre, sede por defecto).

Respuesta ejemplo:

```json
{
  "d": {
    "area": "Jf Sede Sin P Ley 53",
    "country": "COL",
    "name": "Santiago Rivera",
    "userId": "10000",
    "defaultLocation": "Sede Salitre"
  }
}
```

### 2) Listado de sedes

- Metodo: `GET`
- Ruta: `/locations`
- Uso: poblar sedes para modalidad presencial.

Respuesta ejemplo:

```json
{
  "locations": [
    {
      "code": "01",
      "name": "Sede Cedritos",
      "allowedForTelework": true
    }
  ]
}
```

### 3) Horarios semanales (catalogo)

- Metodo: `GET`
- Ruta: `/schedules?userId=10000`
- Uso: poblar lista de horarios.

Respuesta ejemplo:

```json
{
  "schedules": {
    "element": [
      {
        "allowedForOnsite": "true",
        "allowedForTelework": "true",
        "code": "H1",
        "endTime": "16:00:00",
        "name": "7:00 AM - 4:00 PM",
        "startTime": "07:00:00"
      }
    ]
  }
}
```

### 4) Contexto semanal

- Metodo: `GET`
- Ruta: `/week-context?userId=10000&startDate=2026-03-23`
- Uso: fuente principal de estado de la semana y detalle por dia.

Campos clave:

- `weekStatus`: `SAVED` o `EMPTY`
- `editable`: habilita o bloquea toda la semana
- `days[]`: informacion por dia (workMode, location, schedule, locked, absenceType)

### 5) Guardado de planificacion

- Metodo: `POST`
- Ruta: `/save`
- Requisito tecnico: obtener `x-csrf-token` antes de enviar.

Body esperado:

```json
{
  "userId": "10000",
  "weekStart": "2026-03-23",
  "entries": [
    {
      "date": "2026-03-23",
      "workMode": "FESTIVO",
      "location": "",
      "schedule": ""
    },
    {
      "date": "2026-03-24",
      "workMode": "PRESENCIAL",
      "location": "08",
      "schedule": "H2"
    }
  ]
}
```

## Flujo recomendado de carga en UI

1. Cargar contexto base de interfaz (`employee-context`).
2. Cargar catalogos (`locations`, `schedules`).
3. Cargar semana (`week-context`) para la fecha de inicio (lunes).
4. Pintar formulario diario y aplicar bloqueos.
5. Permitir cambios solo en dias editables y no bloqueados.
6. Guardar semana completa en `/save`.

## Reglas de mapeo para `entries`

- `workMode`:
- `FESTIVO` si dia festivo bloqueado.
- `AUSENCIA` si ausencia bloqueada.
- `PRESENCIAL` o `TELETRABAJO` segun seleccion del usuario.
- `location`:
- Obligatorio en presencial (codigo de sede, por ejemplo `08`).
- Vacio en teletrabajo/festivo/ausencia.
- `schedule`:
- Obligatorio para presencial y teletrabajo (codigo, por ejemplo `H2`).
- Vacio en festivo/ausencia cuando aplique.

## Manejo de CSRF Token

Antes del `POST /save`:

1. Hacer request con cabecera `x-csrf-token: Fetch`.
2. Leer token de respuesta en `x-csrf-token`.
3. Reenviar `POST /save` con ese token y cookies/sesion correspondiente.

## Ejecucion local

Dependiendo del setup del proyecto UI5:

```bash
npm install
npm start
```

Si usas UI5 Tooling:

```bash
npx ui5 serve -o index.html
```

## Notas de implementacion

- Mantener desacoplada la capa de servicios (API client) de la capa de presentacion.
- Centralizar validaciones de negocio antes de guardar.
- Evitar hardcode de `userId` y `startDate`; parametrizar segun sesion y semana seleccionada.
- Registrar trazas de errores de integracion para diagnostico de CPI/BTP.

## Repositorio

- GitHub: https://github.com/NiltonRamirez/Horario_FlexibleFioriV2
