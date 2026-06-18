# Round-3 — Audit Loop

> Un loop para **auditar la calidad de un cambio que ya existe** (un PR, un fix de otro
> agente) — no para re-diagnosticarlo. La unidad de trabajo es **UN cambio a la vez**,
> nunca un batch, siempre con humano en el loop.

Esta es la versión generalizada y reutilizable de un framework que uso para integrar fixes
producidos por agentes (Codex, otro Claude) sobre una rama viva. La idea central: cuando un
fix **ya pasó** por su propio proceso de hipótesis → implementación → verificación, lo que
aportás de nuevo no es re-diagnosticar — es el **lente de arquitectura** y un **juez
independiente**.

---

## Por qué existe

Un fix producido por un agente ya viene "auto-criticado": el agente que lo escribió hizo su
hipótesis, su criterio y su verificación. Re-hacer eso es desperdicio. Pero el agente que
escribe un fix **no puede revisarlo de forma confiable** — tiene el sesgo de su propia
solución. Dos cosas que ese agente pudo hacer mal o saltar:

1. **La arquitectura** — el fix funciona pero rompe fronteras, duplica estado, o parchea
   un síntoma en vez del contrato roto.
2. **La conversación/UX real** — el código pasa los tests pero la experiencia quedó mediocre.

El loop ataca esas dos, no la hipótesis ciega.

---

## El loop (cada paso produce un ARTEFACTO obligatorio)

El principio que lo hace morder: **los docs no previenen — los artefactos sí.** Cada paso
exige una evidencia que no podés falsear. Si no podés pegar el artefacto, no podés hacer la
afirmación.

```
0. LEER EL TRANSCRIPT COMO USUARIO  (anti-anclaje barato)
   Artefacto: la conversación/output real ANTES de mirar el diagnóstico o el código.
   La falla suele ser auto-evidente en la respuesta. Se CALIFICA, no se descubre.

1. REPRODUCIR EL CASO COMPLETO  (no el turno aislado)
   Artefacto: probe del flujo ENTERO en la rama viva, con la data real verificada.
   Seguí qué pasa DESPUÉS (accept / reject / switch). La ambigüedad sólo aparece
   en el caso completo. El mecanismo del tracker es HIPÓTESIS hasta que la traza lo confirme.

2. AUDITAR EL CAMBIO CON LOS 3 GATES DE ARQUITECTURA  (el corazón del loop)
   Artefacto: el veredicto por gate. Ver abajo.

3. INTEGRAR SOBRE LA RAMA VIVA  (no sobre la base muerta del PR)
   Artefacto: el diff aplicado sobre HEAD real. El "before/after" del PR suele medirse
   en una base muerta — el root real a veces está UPSTREAM. Medí la tasa en HEAD VIVO.

4. JUEZ DE CONTEXTO FRESCO  (vinculante)
   Artefacto: el veredicto de un sub-agente que NUNCA vio el fix. El que escribió el
   código no lo juzga. Un juez fresco supera a la auto-crítica.

5. STRESS = GATE DE CIERRE  (obligatorio)
   Artefacto: ~10-12 conversaciones realistas adversarias + el veredicto del juez fresco,
   guardado como prueba. No cierra sin esto.

6. DEUDA → UN SOLO TRACKER  (SSOT)
   Artefacto: cada residual registrado en una fuente ÚNICA, con un dueño. Nunca dispersar.
   Cada "defer" necesita pasar primero el gate-de-capacidad: ¿la maquinaria ya existe?
```

---

## Los 3 gates de arquitectura

El lente que aporta valor nuevo. Antes de aceptar un fix:

1. **¿Debería existir este path?** (Gate-0) — Antes de razonar si el fix es correcto,
   preguntá si el código que toca *debería existir*. A veces el fix correcto es borrar.
2. **¿El fix está en el chokepoint correcto?** — Un dato duplicado en N representaciones se
   arregla en **UN** punto upstream, no con N parches. Estructural > léxico.
3. **¿Es un invariante o un guard de síntoma?** — Un guard garantiza su *assertion*, no el
   invariante. Asertá el invariante, no el síntoma. Un fix en la FUENTE (clear/decay del
   estado en el boundary) supera a gatear cada lector (whack-a-mole).

> Para *diseñar* el fix, no solo auditarlo, se aplican juntas las cinco skills de
> arquitectura de este repo. Mencionarlas ≠ aplicarlas.

---

## Anti-patrones (aprendidos a los golpes)

- **El título del cambio ≠ su scope.** Leé el diff, no el título.
- **El before/after del PR suele medirse en base muerta.** Medí en la rama viva; el root
  real puede estar upstream del cambio.
- **El POST/replay vivo es el árbitro.** Más de un fix pasó los unit-tests con estado
  *fabricado* y el replay real lo refutó. La verificación **no se delega**.
- **El momentum justifica UN move grande, no encadenar micro-tareas.** Pará y presentá la
  decisión.
- **"No se puede reproducir" es un cop-out** cuando tenés herramientas de escritura: sembrá
  la escena. Y verificá que la data del bug aún exista antes de medir — "no reproduce" ≠
  "ya arreglado" (gate-de-escena).
- **Auto-certificarse está prohibido.** Artefacto-o-no-pasa.

---

## Cuando no hay un PR: el loop de verticales

Algunos trabajos no tienen un PR que auditar (refactors transversales, residuales
user-facing). Ahí el riesgo es que el agente **improvise** y deje caer disciplinas. La
solución es el mismo principio — **artifact-gated** — aplicado a un trabajo de campo
abierto: gate de capacidad antes de cualquier "defer", reproducir la conversación completa,
calidad de respuesta dentro del scope. Para *partir* un reporte de fallas en unidades
paralelas, ver [`vertical-decomposition`](vertical-decomposition/).

---

<sub>Versión generalizada y de-VozIA-sanitizada de un framework interno. La metodología es
reutilizable; los detalles de runtime propietarios se omiten a propósito.</sub>
