# Guía de configuración: SmokIA (para mi socio)

Todo se hace en **Configuración** (menú lateral). Cada clave se pega, se guarda y queda cifrada. Es solo tuya: no la ve nadie más. Hacelo en este orden.

## 1. Motores de IA (hacelo primero, sin esto fallan varias funciones)

**Groq** (aperturas, análisis del copiloto, recomendaciones de contenido)
1. Entrá a https://console.groq.com/keys con tu cuenta de Google.
2. Tocá **Create API Key** y copiala (empieza con `gsk_`).
3. En Configuración → **Groq**, pegala y guardala.

**Google AI Studio / Gemini** (enriquecer leads, guiones, reescrituras)
1. Entrá a https://aistudio.google.com/apikey.
2. Tocá **Create API key** y copiala (empieza con `AIza`).
3. En Configuración → **Google AI Studio (Gemini)**, pegala y guardala.

**Anthropic**: no hace falta. Se usa solo para el chat de Marca con herramientas. Podés dejarla vacía.

## 2. Gestor de Leads

**Apify** (para generar listas desde Google Maps e Instagram)
1. Creá una cuenta en https://console.apify.com.
2. Andá a **Settings → API & Integrations** y copiá tu **API token** (empieza con `apify_api_`).
3. En Configuración → **Apify**, pegalo y guardalo.
4. Ojo: Apify cobra por resultado. Para las primeras pruebas, poné pocos resultados (5).

**Actores de Apify**: no toques nada. Google Maps e Instagram ya traen uno por defecto. Solo se carga uno si vas a generar leads de **LinkedIn**.

**Perfil del vendedor**
Escribí, en pocas líneas, lo que el copiloto puede decir sobre vos. Sé honesto, porque el copiloto no puede afirmar nada que no esté acá. Ejemplo:
> Trabajo solo, con automatizaciones e IA para negocios de servicios.
> Casos reales: una barbería (gestión de clientes y recordatorios).
> Todavía no tengo casos en estética, salud ni gastronomía.

**Rubros**
Agregá los rubros a los que vas a vender (por ejemplo Peluquerías, Clínicas, Gimnasios), cada uno con un color. Sirven para filtrar la lista y para medir qué combinación de rubro y zona cierra mejor.

## 3. Gestor de Marca Personal

**Instagram (Meta)**: cada uno conecta su propia cuenta. Hace falta una cuenta **profesional** (Business o Creator). Se piden dos datos:
- **Token de acceso** de larga duración (empieza con `IGAA…` o `EAA…`)
- **Id de la cuenta de Instagram** (número largo, tipo `1784…`)

Pasos:
1. Generalos desde tu app en https://developers.facebook.com. Si no te sale, pedí ayuda con este paso, que es el más técnico.
2. Pegalos en Configuración → **Instagram (Meta)** y tocá **Conectar**.
3. Tocá **Probar conexión** y confirmá que aparezca el tilde verde.
4. **El token vence a los 60 días.** Si la conexión falla con "venció o fue revocado", generá uno nuevo y usá **Reemplazar**.

## 4. Chequeo final

- En cada sección tiene que aparecer la clave enmascarada. Eso quiere decir que quedó guardada.
- En Instagram, **Probar conexión** tiene que dar OK.
- Después andá a **Leads → Generar**, armá una lista chica de prueba (5 resultados) y revisá que aparezcan leads.

**Si algo falla:**
- *"Esta cuenta no tiene acceso"*: tu mail no está en la lista de permitidos. Avisá.
- Error 429 de Gemini o Groq: llegaste al límite del plan gratis. Esperá un rato o avisá.
