# Correo de la empresa en SmokIA

## Objetivo

Trabajar desde el Gestor de Leads con la casilla `@gmail.com` de la empresa. La persona titular autoriza la conexión con Google y puede compartirla con su socio. Cada uno entra con su propia cuenta de SmokIA. La primera entrega se valida en local con una casilla de prueba. Conectar el correo real corresponde al despliegue posterior.

## Enfoque

Usar la API de Gmail directamente. El proveedor conserva el historial, los hilos, las etiquetas, los borradores y los adjuntos. SmokIA consulta los datos al abrir la sección y ejecuta las acciones en Gmail. Se actualiza la vista después de cada acción y al retomar la pestaña. Incluir un botón Actualizar.

Una copia de la bandeja mediante sincronización permitiría consultas locales y actualizaciones en segundo plano, a cambio de mantener otra copia de datos sensibles, gestionar desfases y operar un proceso de ingesta. El acceso directo cubre el alcance y deja esa infraestructura para cuando exista una necesidad concreta. Las actualizaciones por notificación y el enlace con leads quedan fuera de esta entrega.

## Experiencia

- Agregar Correo después de Chats en el menú del Gestor de Leads, en `/leads/correo`.
- Mostrar Recibidos, Enviados, Borradores, Destacados, Todos, Archivados, Spam y Papelera, además de las etiquetas de la cuenta. Usar filtros nativos de Gmail y paginación para navegar el historial completo.
- Mostrar hilos con remitente, asunto, fecha, vista previa, estado de lectura y etiquetas. Al abrir uno, mostrar los mensajes y sus adjuntos. Adaptar la vista de escritorio a una pantalla por vez en celular.
- Permitir buscar, marcar leído o no leído, destacar, archivar, mover a la papelera y restaurar, y aplicar o quitar etiquetas existentes.
- Permitir redactar, editar borradores, responder, responder a todos y reenviar. Incluir CC, CCO y un máximo de 3 MiB en total para adjuntos nuevos cargados desde SmokIA, con validación visible en el editor. Vercel admite 4.5 MB por solicitud de forma predeterminada. Ofrecer Abrir en Gmail para cargas más grandes. Conservar el hilo al responder. Los envíos requieren una acción explícita.
- Mostrar estados de conexión, carga, bandeja vacía, búsqueda sin resultados y error recuperable. Mantener el texto del editor si falla un envío y ofrecer reconexión cuando Google revoca el permiso.
- Usar los componentes y temas de SmokIA. Tomar de Gmail las convenciones de navegación y operación.

## Conexión y privacidad

- Agregar Conectar Gmail en Configuración, separado del inicio de sesión de SmokIA. Usar OAuth web con un cliente dedicado, alcance `gmail.modify`, acceso sin conexión y verificación de estado de un solo uso ligado a la sesión, con PKCE. Usar una URL de retorno configurada para cada entorno.
- Guardar el token de renovación cifrado con la infraestructura de `lib/crypto.ts`. Mantener tokens y secreto del cliente OAuth en el servidor. La base sólo conserva información de conexión, estado y acceso. El contenido del correo, adjuntos y resultados de búsqueda se consultan a demanda, sin persistencia en Supabase, caché compartida o registros.
- Una conexión activa por equipo. La persona que la conecta es la única que puede compartir, dejar de compartir, reemplazar o desconectar. La conexión empieza privada. Después de compartir, sólo los miembros actuales del equipo tienen acceso, con controles de Supabase y autorización comprobada en cada lectura, descarga y acción. Seguir el esquema por propietario y equipo de Chats y probar el aislamiento con un tercero.
- Si el titular deja el equipo, la conexión queda inhabilitada para todos y el equipo puede autorizar una nueva. Si el socio deja el equipo, pierde su acceso a la conexión compartida. Verificar ambos casos.
- Renderizar mensajes HTML con contenido sanitizado y aislamiento. Mantener imágenes remotas bloqueadas de forma predeterminada. Entregar los adjuntos existentes como descargas autenticadas en streaming, con una opción para abrir el mensaje en Gmail.
- Las acciones sobre la casilla se aplican a la cuenta de Gmail y las ven ambos socios. Borrar definitivamente, filtros automáticos, administración de alias, integración con modelos y otras funciones de configuración de Gmail quedan fuera de esta entrega.

## Prueba local y criterios de aceptación

- Configurar un cliente OAuth de desarrollo con audiencia Externa en modo Pruebas y agregar una cuenta `@gmail.com` de prueba. Google emite tokens de renovación con una duración de siete días en ese modo con estos permisos.
- Probar la conexión, la búsqueda de un correo antiguo y la navegación de etiquetas y carpetas. Enviar y responder a una cuenta de prueba, confirmar el hilo en Gmail, guardar un borrador y validar carga y descarga de un adjunto.
- Comprobar que una acción en SmokIA se refleje en Gmail y que una acción en Gmail aparezca al actualizar. Verificar acceso con la cuenta propietaria, con la de su socio antes y después de compartir y con una de otro equipo.
- Verificar la bandeja y el hilo en celular y escritorio, y la recuperación ante un error de red o permiso revocado.
- Para producción, configurar un proyecto OAuth separado y confirmar el modo de publicación y las condiciones de Google para la audiencia limitada prevista antes de asociar la casilla real.

## Referencias

- API de Gmail — https://developers.google.com/workspace/gmail/api/reference/rest
- Permisos de Gmail — https://developers.google.com/workspace/gmail/api/auth/scopes
- Autorización de aplicaciones web — https://developers.google.com/identity/protocols/oauth2/web-server
- Vigencia de los permisos en pruebas — https://developers.google.com/identity/protocols/oauth2#expiration
- Excepciones de verificación — https://support.google.com/cloud/answer/13464323
- Límites de Vercel Functions — https://vercel.com/docs/functions/limitations#request-body-size
