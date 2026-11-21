# Publicación de Clientes, Tareas y Proyectos

## Antes de publicar

1. Confirmar la rama de producción de Vercel y el proyecto de Supabase que esa rama usa. Actualizar las referencias de Git y comprobar que el cambio contiene la última revisión de la rama de destino.
2. Probar el commit en un Preview conectado a una base de pruebas con la misma versión de PostgreSQL que producción. El proyecto local declara PostgreSQL 17. Confirmar que la copia de seguridad de producción esté disponible y que el equipo pueda restaurarla.
3. Desde el commit candidato, con la CLI vinculada **al proyecto confirmado**, usar `supabase migration list --linked` y `supabase db push --linked --dry-run`. Comparar ambas salidas. Si aparecen versiones ajenas al cambio, versiones remotas ausentes en Git o un esquema divergente, resolver esa diferencia antes de aplicar.

## Orden

Aplicar las migraciones con la CLI de Supabase antes de promover el commit en Vercel. Si el repositorio dispara despliegues por push a producción, completar primero la migración. Las migraciones del CRM deben quedar registradas en este orden:

| Versión | Cambio |
| --- | --- |
| `20261122120000` | Clientes, contactos y tareas |
| `20261122130000` | Estados del Kanban y acceso compartido |
| `20261122140000` | Responsables múltiples, cargo y colores |
| `20261122150000` | Proyectos, etapas y vínculo con tareas |
| `20261122151000` | Acceso por cliente y control de ediciones simultáneas |

La tercera migración copia los responsables existentes antes de retirar `crm_tasks.assignee_id`. Si producción ya sirve una versión intermedia del CRM que usa esa columna, coordinar una ventana breve de mantenimiento y desplegar la aplicación nueva inmediatamente después de migrar. Un rollback binario a esa versión intermedia requiere recuperar la compatibilidad del esquema. Para un problema de datos, evaluar restauración o corrección hacia adelante sobre la copia de seguridad.

## Comprobación posterior

Entrar con dos cuentas del mismo equipo. Abrir un cliente con varios proyectos, verificar que ambos vean las mismas tareas y colores, y mover una tarjeta de prueba. Confirmar que el estado y el avance se actualizan al recargar. Con una cuenta externa, comprobar que la ficha del cliente y del proyecto quedan fuera de alcance. Usar registros de prueba identificables.

Referencia: [migraciones de base de datos en Supabase](https://supabase.com/docs/guides/deployment/database-migrations).
