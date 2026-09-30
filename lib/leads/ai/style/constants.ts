/**
 * Umbrales del bucle de estilo (Plan §1.20). Viven acá y no en la base: el
 * `edit_distance` se guarda crudo y el umbral se aplica al leer, así que
 * recalibrar es cambiar estas constantes, no migrar datos.
 */

/** Mínimo de caracteres cambiados para que cuente como edición real — abajo de esto es un typo. */
export const STYLE_EDIT_MIN_DISTANCE = 8;

/** Y además, mínimo proporcional: 12 caracteres en una apertura de 400 sí, en una de 60 no. */
export const STYLE_EDIT_MIN_RATIO = 0.03;

/** Cuántos pares (propuesto → enviado) se inyectan en el prompt. */
export const STYLE_EXAMPLE_LIMIT = 4;

/** Tope del bloque de ejemplos, truncando el más viejo primero (≈500 tokens). */
export const STYLE_BLOCK_MAX_CHARS = 1800;
