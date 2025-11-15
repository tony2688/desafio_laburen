## WhatsApp Cloud API – Setup

### Variables de entorno
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`

### Webhook
- Ruta: `POST /webhooks/whatsapp`
- Verificación: `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
- POST: recepción de mensajes, normalización y respuesta 200.

### Configuración en Meta
- En Meta for Developers: añade tu endpoint público `/webhooks/whatsapp` y usa `WHATSAPP_VERIFY_TOKEN`.
- Autoriza la suscripción y prueba con el panel de herramientas.

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