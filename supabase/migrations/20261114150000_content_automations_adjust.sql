-- §1.26 sub-paso 4 — ajuste de esquema al implementar la clonación por pieza.
--
-- El molde terminó siendo un WORKFLOW standalone (creados el 2026-11-14 a
-- partir de los diagramas del dueño), sin automatización de comentario
-- propia: el par automatización-de-comentario + workflow recién se arma POR
-- PIEZA, con la automatización apuntando (por postback) al workflow clonado.
-- `zernio_comment_automation_id` del molde queda sin uso por ahora (se deja
-- nullable por si algún día el molde SÍ tiene una propia, como el patrón de
-- MANOS). Se suma `confirm_message`: el texto corto que la automatización de
-- comentario manda antes de entregarle el turno al workflow, editable por
-- molde (con el marcador [[TITULO]]); si queda vacío, se usa un default.

alter table public.chat_automation_templates
  alter column zernio_comment_automation_id drop not null;

alter table public.chat_automation_templates
  add column if not exists confirm_message text check (confirm_message is null or char_length(confirm_message) <= 640);
