## WhatsApp Cloud API – Setup

### Variables de entorno
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION` (por defecto `24.0`)

### Webhook
- Ruta: `POST /webhooks/whatsapp`
- Verificación: `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
- POST: recepción de mensajes, normalización y respuesta 200.

### Configuración en Meta
- En Meta for Developers: añade tu endpoint público `/webhooks/whatsapp` y usa `WHATSAPP_VERIFY_TOKEN`.
- Autoriza la suscripción y prueba con el panel de herramientas.

### Registrar números de prueba permitidos (Recipient list)
- Entra al panel de la aplicación en Meta → sección `Configuración de la API → Enviar y recibir mensajes`.
- En el selector `Para`, agrega el número del usuario en formato E.164 como dígitos continuos, sin `+` ni espacios. Ejemplo: `5493813581745`.
- Para identificar el número correcto, envía un mensaje al bot y mira los logs del backend:
  - Ejemplo de log: `whatsapp_incoming { from: "5493813581745", text: "Hola" }`.
  - Usa exactamente ese valor de `from` para agregarlo en `Para`.
- Usa el botón `Enviar mensaje` con la plantilla `hello_world` para validar que el teléfono recibe mensajes desde el sandbox.

### Restricciones del sandbox
- Solo los números agregados en la lista de destinatarios (`Para`) pueden recibir mensajes desde el entorno de prueba.
- Si pasan más de 24 horas sin que el usuario envíe un mensaje, la conversación expira para texto libre. Debes reiniciarla enviando una plantilla aprobada (por ejemplo `hello_world`) y luego ya puedes responder con texto libre.

### Pruebas rápidas
- Verificación:
  - `curl "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=123"`
- Mensaje simulado (estructura básica):
  - Ejemplo de entrada:
```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "54911...",
                "type": "text",
                "text": { "body": "Hola, quiero zapatillas negras talla M" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```
  - Ejemplo de respuesta enviada a WhatsApp:
```json
{
  "messaging_product": "whatsapp",
  "to": "54911...",
  "text": { "body": "Aquí tenés opciones: ID p123 - Camiseta negra M ($10) ..." }
}
```

### Troubleshooting: error `#131030` – Recipient phone number not in allowed list
- Descripción: al enviar `POST /{phone_number_id}/messages` devuelve 400 con el error `(#131030) Recipient phone number not in allowed list`.
- Causas típicas:
  - El número no está agregado en el selector `Para` del panel de Meta.
  - El número está agregado con un formato diferente al `from` de los logs.
- Checklist:
  - El número en los logs (`from`) coincide exactamente con el configurado en `Para`.
  - `WHATSAPP_PHONE_NUMBER_ID` en el backend coincide con el que muestra el panel.
  - `WHATSAPP_ACCESS_TOKEN` es el token actual generado desde el botón `Generar token de acceso`.
  - El usuario recibió el mensaje de plantilla `hello_world` desde el panel.