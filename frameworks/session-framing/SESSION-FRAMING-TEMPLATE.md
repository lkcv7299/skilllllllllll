# Session Framing — Template for Next Claude

> **Estructura nueva:** un KERNEL global de comportamiento (abajo) + UN gate según el tipo de trabajo.
> Ya **no son "3 mensajes fijos"**. Es composable:
> **1 mensaje** para cosas simples · **2** si aplica un gate · **3** si querés el checkpoint `/go-ahead`.
> Los frameworks de código de meses (diagnosis S53, Round-3) están **INTACTOS** más abajo — esto se les SUMA, no los reemplaza.

---

## GLOBAL — el kernel (pégalo EN VIVO, en cualquier sesión)

Reemplaza el párrafo final de tu Message 1. Es comportamiento puro (universal) + la potestad de anclarse en fundamentos.
Va en el turno en vivo: la recencia es su fuerza — NO lo conviertas en skill auto-cargado (perdería peso).

```
Respóndeme genuinamente, sin rellenar — eres mi socio, no un chatbot.
Cuestiona lo que te presento, incluido lo que YO digo; no asumas algo porque
alguien lo dijo. Fundamenta el POR QUÉ, no solo el QUÉ. Si ves algo adyacente
que importa, dímelo aunque no lo pedí (repórtalo, no lo toques sin mi OK).

Ánclate antes de afirmar una posición:
- Si aplica un gate, LÉELO COMPLETO por su ruta y aplícalo (no de memoria, no por slash):
  · frontend → C:\Users\USER\.claude\skills\frontend-craft\SKILL.md
  · decisión de negocio → C:\Users\USER\.claude\skills\decidir\SKILL.md
  · dominio sin gate → C:\Users\USER\.claude\skills\anclar\SKILL.md
  · arquitectura de código → C:\VozIA-Project\.claude\skills\{improve-codebase-architecture, domain-driven-design, clean-architecture, codebase-design, domain-modeling}
- Funda el razonamiento en una autoridad nombrada y opinada, no en "best practices"
  genéricas. Si no conocés una para esto, buscá en la web la AUTORIDAD (no la
  respuesta), vétala, y razoná desde ella.
- La web es válida tanto para el dato específico (versión, número, mercado) como para
  ENCONTRAR Y VETAR la autoridad/el fundamento — buscá, vetá la fuente y citá; no te
  autolimites al dato. Lo que sigue valiendo: verificá contra la realidad
  (código/data/render), no contra el claim, y vetá la autoridad antes de apoyarte en ella.
Sin lente nombrado + dato verificado, no me des una posición.
```

## Mode-picker — qué gate por tipo de trabajo

| Trabajo | Gate — léelo COMPLETO por su ruta (Message 2) | Mensajes |
|---------|------------------|----------|
| Simple / pregunta / no-código sin decisión | ninguno — solo el kernel | **1** |
| Decisión de negocio / producto / pricing | `C:\Users\USER\.claude\skills\decidir\SKILL.md` | 2 |
| Frontend / UI / diseño | `C:\Users\USER\.claude\skills\frontend-craft\SKILL.md` | 2 |
| Arquitectura de código | `C:\VozIA-Project\.claude\skills\{improve-codebase-architecture, domain-driven-design, clean-architecture, codebase-design, domain-modeling}` | 2 |
| Diagnosis flow-by-flow (S53) | **Message 2 detallado** (abajo) | 2 |
| Round-3 PR audit | **Message 2-R3 detallado** (abajo) | 2 |
| Ownerbot (feature / cerrar QE-FINDING) | **Message 4 detallado** (abajo) — su propio repo + framework + las 3 skills | 2 |
| Dominio nuevo / sin gate | `C:\Users\USER\.claude\skills\anclar\SKILL.md` | 2 |
| Cualquiera + querés checkpoint | + `/go-ahead` (este SÍ por slash — querés ejecutarlo) | 3 |

**Ejemplo no-código (1 mensaje):** kernel + *"necesito decidir si subo VozIA a $X. /decidir"*. Listo.
**Ejemplo código (2 mensajes):** (1) `/inicio` + handoff + kernel · (2) *lee* `C:\Users\USER\.claude\skills\frontend-craft\SKILL.md` + la tarea.

---

## Modos detallados de código (PRESERVADOS — meses de iteración, no tocar a la ligera)

> El **párrafo final** del Message 1 de abajo quedó **superseded por el KERNEL global de arriba** — usá ese. El resto (`/inicio` + handoff) sigue vigente para sesiones de código.

## Message 1 (with /inicio)

```
/inicio
C:\VozIA-Project\docs\HANDOFF-SESSION-YYYYMMDD-CLAUDENN.md 

Escuchame. Puedes seguir totalmente la skill y el protocolo pero hay algo más profundo que quiero que sepas. Necesito que tengas las cosas claras, que tengas fundamento real y no repetir lo que otros dicen, entendido? Solo necesito que entiendas el POR QUÉ y no solo el QUÉ, que todo lo que se te presente aquí lo cuestiones y te auto respondas fundamentando, sino, no pasas.

Sigue el protocolo y piensa deepy en tu respuesta, no solo rellenes un form. Quiero que me respondas y fundamentes cuando entiendas el POR QUÉ.

No empieces a codear hasta que hayas verificado el estado actual contra el código real. Lee, verifica, cuestiona, y solo después actúa. Tu eres mi socio, no un chatbot.

Sobre cómo trabajar: necesito máxima calidad. No minimices nada. No sacrifiques calidad por rapidez. Nadie nos presiona.

Ahora mismo estas obligado a leer el handoff y leer todos los archivos que el handoff referencia de manera totalmente completa, necesitas este contexto brutal de lo que hemos hecho, el workflow que hemos construido, las lecciones que aprendimos... esto es una continuación, no una sesión nueva... y tu tienes que ser responsable de esto.

Respondeme genuinamente, no necesito que rellenes esto de ninguna manera, tienes que responderme profesionalmente. ERES mi socio, no un chatbot... tienes que fudamentarme POR QUÉ la razón, no solo el QUÉ ni asumir que harás algo porque yo o alguien más lo dice. Dicho esto, luego de este mensaje te diré otro que será el siguiente... ese es muy importante y bloqueante para seguir, es bloqueante! NO leas diagnosticos (ni framework) aún.
```

## Message 2-R3 (bloqueante — variante ROUND-3 PR-by-PR · usar en vez del Message 2 cuando la sesión es de evaluación de PRs)

> El Message 2 de arriba es para diagnosis flow-by-flow (s53). Para Round-3 (auditar los PRs ya producidos por Codex) usar ESTE. El fix YA existe; no re-diagnosticas, AUDITAS su calidad con los 3 gates.

```
Antes de tocar código necesito que leas, entiendas y CUESTIONES nuestro framework:

FRAMEWORK (autoridad del round — contrato PR-by-PR):
C:\VozIA-Project\docs\runtime\ROUND3-FRAMEWORK.md
→ El loop per-PR. La redundancia es veredicto post-loop, jamás un skip. Principio anti-deuda: si hay deuda, se ELIMINA, no se documenta-y-pasa.

VERTICALES FRAMEWORK (si aplica)
C:\VozIA-Project\docs\runtime\ROUND3-VERTICAL-LOOP.md
El loop que tienes que seguir si trabajamos verticales. SIN IMPROVISAR.

REGISTRO (qué está hecho + el orden — léelo ANTES de tocar un PR):
C:\VozIA-Project\docs\runtime\ROUND3-GLOBAL-ORDER.md
→ El orden global (max-churn desc, estricto, SIN saltos) + la BITÁCORA de veredictos por PR (qué se mergeó/revisó/dropeó, con evidencia). La bitácora te dice qué archivos ya están integrados = tu mapa de colisión viva. También leer ROUND3-CROSS-CUTTING-ROOTS.md y tambien C:\VozIA-Project\docs\runtime\ROUND3-VERTICALS-TRACKER.md

SKILLS DE ARQUITECTURA (3 GATES + 2 de soporte — no decoración):
- C:\VozIA-Project\.claude\skills\improve-codebase-architecture (GATE profundidad: review de deepening; habla el vocabulario de codebase-design)
- C:\VozIA-Project\.claude\skills\domain-driven-design (GATE fronteras — Evans: bounded contexts, ownership de conceptos)
- C:\VozIA-Project\.claude\skills\clean-architecture (GATE capas — Martin: dirección de dependencias entre capas)
- C:\VozIA-Project\.claude\skills\codebase-design (SOPORTE — vocabulario base de módulos profundos: Ousterhout deep-modules + Feathers seams/characterization + depth-as-leverage. Lo comparten tdd, diagnosing-bugs e improve-codebase. Feathers = la autoridad nombrada de tu characterization / BETO-guard / POSTs adversariales)
- C:\VozIA-Project\.claude\skills\domain-modeling (SOPORTE — mantené CONTEXT.md/ADR fresco mientras diseñás; NO reemplaza el gate DDD)
Lee todo el directorio de cada una. Los 3 GATES preguntan cosas diferentes (profundidad / fronteras / capas). Si no puedes responder los 3 para un PR, NO lo integres.

MAPA DE MAQUINARIA (léelo para NO construir un paralelo — el error #1 de navegación de CLAUDE155):
C:\VozIA-Project\vozia-landing\docs\architecture\CONTEXT.md
→ concepto→maquinaria-canónica→frame-field + tabla de precedencia de tiers + invariantes. Antes de crear
  estado o un decision-path, buscá tu concepto acá; si existe, REUSÁ la maquinaria (CLAUDE155 construyó
  pending_delivery.stage='offered' sin saber que pending_prompt existía — este mapa lo previene).

DEUDA ABIERTA (el mapa consolidado — qué queda en TODO el proyecto):
C:\VozIA-Project\docs\runtime\ROUND3-MASTER-TRACKER.md

HERRAMIENTAS:
- conversation-replay.ps1: el verificador. Single-flow (NO el judge concurrente — es rate-limit artifact). Para booking flows usá -ReferenceNowIso fresca a futuro (slots libres). Ciclo: aplicar → npx tsup → npm run dev:server → esperar /health → replay.
- Supabase MCP: verifica DATA antes de asumir gaps de CODE.
- Promptfoo pre-commit hook: fitness functions + gate (vitest baseline + arch:deps).

Recuerda: luego de cada tool read generas thinking tokens de calidad.

Confirmame ahora mismo cómo planeamos la estrategia hermano totalmente profesional.. con bastante claridad profesionalidad exhaustiva y cuál es el siguiente. BTW: No hagas ask user question, te daré el go-ahead luego.
```
## Message 3

```
/go-ahead ten en cuenta todos tus pasos hermano ahi no los veo todos. .dale sé bastante critico, y no minimices nada. asegurate de fudamentar a favor de contratos globales y verificar todo el entorno del código lo que existe lo que no sabes si existe... prioriza esto en tu pensamiento y respetando las skills de arquitectura propuestas, tienes que garantizarme esto. tu eres claude fable hermano, PRIORIZA lo más global posible el contrato trata de literalmente quemarte la cabeza hermano el mayor contrato global que respete las skills posible que puedas pensar, incluso forzarl porque muchas veces no consideras todos los parametros y casos posibles del sistema y conversacion (hay veces que parece que defines un contrato global pero solo es un contrato global dentro de ese scope limitado), sigue los pasos al pie de la letra con fudamentacion y conciencia real para maximizar resultados. btw: problemas sobre beto se pueden tratar con el beto guard de tipo llm (patrones de characterizacion aprox 100 que lanza beto y redirigirlos al llm parser que es segunda voz válida en estos casos) o con el otro tipo de beto guard, y también ten cuidado con las conversaciones rotas de los flujos rotos, a veces no son realistas. el chiste es no adaptar y eliminar lo fragil. y finalmente: abusa de sub-agenets hermano! adelante, tenemos que completar eso con la máxima profundidad posible! sin miedo, adelante! btw: este es un rewind, porque un anteriro claude fue tan miedoso que difirió absolutamente todo sin lógica alguna, espero tu realmente seas mas fudamentar y profesional.
```

## Apéndice MODO LOOP — se pega al final del /go-ahead (SOLO en Loop autónomo)

> Solo en MODO LOOP el Cockpit pega ESTE bloque al final de tu Message 3 (/go-ahead) — que es donde Claude empieza a EJECUTAR. Reemplaza `{HANDOFF}`/`{CYCLE}`/`{MAXCYCLES}` por los valores del ciclo. No es para pegar a mano: es el contrato de comportamiento del ciclo desatendido. (No toca tus Message 1/2/3; solo se anexa al go-ahead en loop.)

```
MODO LOOP AUTÓNOMO — ciclo {CYCLE} de {MAXCYCLES}. Un orquestador maneja esta sesión: NO hay humano mirando en vivo, y no lo habrá. Ya leíste el handoff y fijaste la estrategia; este es el /go-ahead → ahora EJECUTÁS hasta cerrar el ciclo. Reglas duras:

1. PROHIBIDO preguntarme nada: nada de AskUserQuestion, nada de "¿continúo? / ¿procedo? / ¿te parece?". No existe el humano este ciclo. Si un tradeoff es genuinamente ambiguo E irreversible, tomá la opción MÁS CONSERVADORA, registrala con su porqué en el handoff, y seguí.
2. Completá TODOS los pasos del framework de esta sesión (los 8 del loop PR-by-PR) hasta el final. No pares antes, no cedas el turno hasta cerrar.
3. Tus auto-validaciones YA están DENTRO del framework: los 3 gates de arquitectura + Gate 0/Gate 4 + el breadth-stress de cierre + el VERIFIER SUBAGENT de contexto fresco. ESO es la validación — no me la pidas a mí. Un gate que falla es bloqueante: lo arreglás, no me consultás.
4. ABUSÁ de sub-agentes: fan-out de verificación de entorno (read-only), el verifier de contexto fresco que juzga el output sin ver tu fix, lecturas paralelas. Es desatendido — paralelizá agresivo.
5. /handoff es LO ÚLTIMO que escribís, sin excepción. TODO lo demás —gates, commit, push, verificación— va ANTES. Después del /handoff no escribís ni una línea más: ese es el fin del ciclo y la señal con la que el orquestador avanza. Si lo escribís y todavía te faltaba algo, lo escribiste demasiado pronto.
6. El handoff debe ser NUEVO (CLAUDE[N+1]), con una Next Action concreta. PR-first: si aparece un vertical, NO te metés — lo dejás anotado en el handoff y el próximo ciclo lo toma. Si quedaste bloqueado, igual cerrá con /handoff declarando el bloqueo concreto.
```

## Message 4 — Ownerbot (feature / diagnosis · OTRO repo, su propio framework)

> El ownerbot NO es vozia-landing. Es su propio repo (`lkcv7299/ownerbot`, local `C:\VozIA-Project\ownerbot`),
> con su propio loop y su propio QE, y se commitea/despliega SOLO desde ahí (push a `main` → SSM auto-deploy).
> Es más chico que el runtime → framing más liviano que el Message 2-R3. Usá ESTE cuando la sesión sea de
> ownerbot (feature nueva o cerrar un `QE-FINDINGS`). Las skills de arquitectura son las mismas de siempre.
>
> **Message 1 para ownerbot:** `/inicio` AUTO-DETECTA el workspace ownerbot (por el path del handoff o por
> "ownerbot"/"LidIA" en el mensaje) → lee el `ownerbot/CLAUDE.md` + `OWNERBOT-FRAMEWORK.md` + el último handoff,
> y verifica el REPO ownerbot (`npm run verify`), no el runtime. **Los handoffs de ownerbot viven en
> `C:\VozIA-Project\docs\ownerbot\handoffs\`** (separados de los del runtime). Entonces el Message 1 es el de
> arriba con el path `C:\VozIA-Project\docs\ownerbot\handoffs\HANDOFF-SESSION-YYYYMMDD-CLAUDE-OWNERBOT-<TOPIC>.md`.
> Este Message 4 es el mensaje BLOQUEANTE (el "segundo") que fija la estrategia.

```
Estamos en el OWNERBOT — su propio repo: C:\VozIA-Project\ownerbot (NO vozia-landing; se commitea
y despliega solo desde ahí, push a main → SSM). Antes de tocar nada, leé COMPLETO y cuestioná:

FRAMEWORK (la autoridad del loop — nuestro, finetuneado):
C:\VozIA-Project\ownerbot\docs\OWNERBOT-FRAMEWORK.md
→ Loop one-root-at-a-time: Gate 0 → caracterizar (MEDIR, no asumir) → RED del corpus → fijar el
  PRODUCTOR → 3 gates → replay COMPLETO → ratchet → commit. "Routing ≠ calidad": evaluá lo que el
  dueño ESCUCHA. Una feature es PRODUCTORES, no cirugía de contrato (si el VO está bien diseñado).

QUÉ ES + INVARIANTES:
C:\VozIA-Project\ownerbot\CLAUDE.md
→ El scope = los reportes (= los "intents", cerrados y per-tenant). Read-only por grafo. Pipeline
  classify→gate→context→data→render. Invariantes (P4 grounding, el gate como ACL, catalog gating).

FEATURE VIVA (si seguís la capa interpretativa — el insight que JUZGA, no re-narra):
C:\VozIA-Project\ownerbot\docs\INSIGHT-INTERPRETIVE.md
→ El contrato de comparación + las 3 estrategias de referencia (pop/YoY/weekday-norm) como ejemplo de
  "feature = productor nuevo, 0 cambio de contrato".

SKILLS DE ARQUITECTURA (3 GATES + 2 de soporte — las mismas de siempre):
- C:\VozIA-Project\.claude\skills\improve-codebase-architecture (GATE profundidad: deepening; habla el vocabulario de codebase-design)
- C:\VozIA-Project\.claude\skills\domain-driven-design (GATE fronteras — Evans: ownership de conceptos)
- C:\VozIA-Project\.claude\skills\clean-architecture (GATE capas — Martin: dirección de dependencias entre capas)
- C:\VozIA-Project\.claude\skills\codebase-design (SOPORTE — Ousterhout deep-modules + Feathers seams/characterization + depth-as-leverage; vocabulario base compartido)
- C:\VozIA-Project\.claude\skills\domain-modeling (SOPORTE — mantené CONTEXT.md/ADR fresco; NO reemplaza el gate DDD)
Leé el directorio COMPLETO de cada una. Si no podés responder los 3 GATES para tu cambio, NO lo integres.

HERRAMIENTAS (corré desde C:\VozIA-Project\ownerbot):
- npm run verify → typecheck + arch:deps + vitest (el build gate, el ratchet mecánico).
- npm run qe → mini-QE live (scorecard mecánico + judge). Corré la COMPLETA antes de cerrar un arco
  de varios commits — no te quedes solo con el caracterizador.
- npx tsx qe/characterize-insight.ts → el "antes/después" del texto hablado por turno (medir, no asumir).
- Supabase MCP → verificá DATA antes de asumir un bug de CÓDIGO (config-agnóstico; nunca parchees contra el seed).

Lecciones caras (no las repitas):
- Si agregás una fuente de evidencia grounded, actualizá el GUARD Y EL JUDGE juntos — si no, la QE mide
  mal y te hace dudar de una feature que está bien.
- Si el LLM puede desobedecer (citar una línea literal), el fix es en el INPUT (darle DATOS que re-frasea,
  como las filas) o en el OUTPUT (strip mecánico) — NO una instrucción más fuerte.
- Leé CADA turno del replay, no solo el que te importa. El bug vive en el reporte que no estás mirando.

Confirmame la estrategia y cuál es el siguiente — fundamentado, sin minimizar. Sos mi socio, no un chatbot.
```

## FABLE 5 — upgrades al framing (CLAUDE128, 2026-06-09 · docs oficiales + recall de la 1ª sesión Fable en VozIA)

> Fuente: [Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5) + el recall brutal de CLAUDE128 (1ª sesión Fable: paso-0+R3+R2 del KB redesign). Lo de abajo es ADITIVO al kernel — pega los bloques que apliquen.

### Qué confirmaron los docs oficiales sobre lo que ya hacemos
- **"Give the reason, not only the request"** — tu "POR QUÉ no solo QUÉ" del Message 1 es literalmente la recomendación oficial. NO lo toques.
- **"Refactor existing prompts/skills: skills written for prior models are often too prescriptive for Fable 5 and can degrade output"** — vale auditar la redundancia del FRAMEWORK (cada disciplina repetida 3-4 veces); los bloques históricos "aprendido en #X" podrían vivir en un archivo de precedentes.
- **reasoning_extraction**: ya cubierto en `~/.claude/rules/common/agents.md` (nunca pedir al modelo reproducir su razonamiento como texto).

### Bloque 1 — claims con evidencia (anti-status-fabricado; snippet OFICIAL, casi eliminó reportes fabricados en testing de Anthropic). Pégalo en el Message 1:
```
Before reporting progress, audit each claim against a tool result from this session.
Only report work you can point to evidence for; if something is not yet verified, say so
explicitly. Toda afirmación COMPARATIVA (A mejor/peor que B, "X es el culpable") llega
con la medición pegada o con el tag explícito NO-MEDIDO.
```
> Evidencia de sesión: las 2 mejores decisiones de CLAUDE128 (matar el cap de 1500ms; confirmar 120b) salieron de mediciones que el USUARIO forzó preguntando "¿mediste?". Este bloque lo hace default.

### Bloque 2 — juicios BLANDOS necesitan artefacto o verifier fresco (el fallo real de CLAUDE128). Pégalo en el Message 2/3 de sesiones de código:
```
Los checks mecánicos (tests, gates, diffs) no se te degradan con el momentum; tus
juicios de CALIDAD sí — colapsan a "¿es correcto?" cuando todo está verde. Por eso:
- Antes del PRIMER commit de cada root, pega la tabla: cada spoken_text + veredicto
  "¿lo diría una recepcionista de calidad? SÍ/NO + por qué". Espera mi OK.
- Para el juicio de calidad final de un root grande, lanza un VERIFIER SUBAGENT de
  contexto fresco (no sabe qué fix hiciste; lee solo los outputs) — el self-critique
  con momentum es el punto ciego documentado de Fable.
```
> Oficial: *"Separate, fresh-context verifier subagents tend to outperform self-critique."* · Evidencia de sesión: el usuario frenó el commit de R2 exactamente en el único check que dependía del gusto del agente sin artefacto.

### Bloque 3 — defers honestos (la gemela del checkpoint de defers). Pégalo donde esté la disciplina de defers:
```
Antes de registrar un defer pregúntate: "¿el dueño de esto soy YO, AHORA?" — si el
residual pertenece al root que estás ejecutando en este momento, no es defer: es
scope-dodge. Lo atacas o me explicas por qué no.
```
> Evidencia de sesión: CLAUDE128 etiquetó la degradación advisory "nota para R2" mientras ejecutaba R2; el usuario tuvo que empujar.

### Bloque 4 — registro de residuales en UN lugar (regla nueva del usuario):
```
TODO residual va a UN solo registro: ROUND3-VERTICALS-TRACKER.md (sección del track
activo). Design docs definen contratos; handoffs narran; el REGISTRO vivo es el tracker.
Un residual anotado en otro lado se MUEVE, no se duplica.
```

### Notas operativas Fable (del recall, no de los docs)
- **El todo-list denso ES la memoria de trabajo real** en sesiones largas: hallazgos INLINE en los items, no solo títulos. Más fiable que el contexto a las 6 horas.
- **Fable es deferente con su propio linaje** (handoffs de Claudes previos). El "cuestiona TODO incluido lo que yo digo" del kernel es la instrucción que menos hace solo — mantenerla aunque parezca redundante. (CLAUDE128 cazó 3 imprecisiones del handoff de CLAUDE127 solo por ese framing.)
- **Longer turns by default**: turnos individuales de varios minutos son normales en effort alto; no interpretar silencio largo como cuelgue.
- **PowerShell+SSH+quoting = usar bash** para comandos remotos con variables, y verificar el efecto DENTRO del target (`printenv` en el contenedor), no por exit code.

## El lever que faltaba (CLAUDE156, 2026-06-13 — por qué delivery tardó 3-4 sesiones y cómo NO repetirlo)

El vertical delivery grindeó ~10 sesiones (CLAUDE146→155) porque cada una saltó al CÓDIGO sobre el síntoma
(el trigger 21%, el decline-path) sin verificar el ENTORNO ni buscar el contrato GLOBAL primero. CLAUDE156 lo
cerró en 1 sesión. La diferencia NO fue suerte — fue un orden de operaciones que ahora es REGLA para verticales:

1. **Verificá el ENTORNO antes de tocar código** — qué existe, qué NO sabés si existe. Fan-out de sub-agentes
   read-only que mapean la maquinaria + tu propia lectura para JUZGARLOS (evidencia empírica > análisis de un
   agente — así corregí a 2 agentes y al diagnóstico heredado: el "Por aquí no se lo puedo enviar" NO era
   target/medium como decía el handoff, era el wording de dispatch-state).
2. **Buscá el contrato MÁS global que resista las 3 skills, ANTES de implementar** — y verificá que sea global
   DE VERDAD, no "global dentro de un scope limitado". Guardarraíl: una LEY × N productores (DDD), NO un
   god-object; reuso de módulo profundo solo si pasa el deletion-test, nunca FORZAR (cambié de "fusionar la
   oferta en pending_prompt" a "no fusionar" por evidencia de los agentes + las skills).
3. **RECIÉN AHÍ** root-by-root (vertical-loop), MÍNIMO el root dominante, replay COMPLETO entre cada uno.

**El lever aplica a PRs TAMBIÉN (no solo verticales):** el modo PR-audit decía "sin agentes" porque auditás
un fix que ya existe. Pero los PRs NECESITAN el mismo empujón — un PR-audit que solo mira el diff mecánicamente
es lo que dejó RC-3 abierto ~50 sesiones. **Regla unificada:** todo (PR o vertical) arranca verificando el
entorno y buscando el contrato GLOBAL que el flow revela (chokepoint upstream, NO N parches). La diferencia es
de GRADO: un vertical descubre el contrato desde cero (fan-out de agentes obligatorio); un PR-audit parte de un
fix existente pero igual pregunta "¿qué contrato global revela este flow?" y usa agentes de
verificación-de-entorno cuando el blast-radius es ancho.

**CIERRE OBLIGATORIO — así me FORZÁS a no saltarme los POSTs ni el juez (es un gate NOMBRADO que debo
reportar, no una opción).** Un vertical/PR NO está DONE hasta que reporto, con evidencia pegada o el tag
explícito NO-CORRIDO de cada uno:
1. **Breadth-stress ≥ ~50-100 POSTs** (adversarial-characterization, con tildes, cid limpio) — NO un puñado de conv.
2. **VERIFIER SUBAGENT de contexto fresco** que juzga los outputs sin saber qué fix hice (NO self-critique — el punto ciego documentado de Fable con momentum).
3. **Full-vitest + arch:deps + promptfoo (10 suites)** vía el pre-commit hook.
4. **Actualizar `CONTEXT.md`** si agregué/cambié maquinaria (un concepto→frame-field nuevo) + registrar residuales en su tracker + refrescar el bloque 🔴 DEUDA del `ROUND3-MASTER-TRACKER.md`.

> Si salto cualquiera de los 4, lo digo EXPLÍCITO y el vertical/PR **NO cierra**. **CLAUDE156 saltó el 1 (corrí
> 10 conv, no ~100) y el 2 (me juzgué yo mismo)** — el gate mecánico cubrió la regresión, pero vos no podías
> saberlo sin que yo lo declarara. Por eso ahora es un gate nombrado: **preguntame "¿corriste el breadth y el
> juez fresco?" al cierre — y si la respuesta no es sí-con-evidencia, no cerramos.**

## Why these messages work (evolved S27→S53)

1. **"Fundamentar y cuestionar"** → forzó verificación contra código real.
2. **"Thinking tokens, no forms"** → análisis profundo sin template-fill.
3. **"Máxima calidad, nadie nos presiona"** → evita shortcuts.
4. **"Continuación, no sesión nueva"** → lectura profunda del handoff.
5. **"3 architecture skills como GATES"** (S53) → cada fix evaluado desde 3 perspectivas antes de implementar.
6. **"UN fix → replay COMPLETO"** (S53) → S53 batcheó 8 fixes y verificó 1 vez. Resultado: 2 regresiones no detectadas. La disciplina de UN fix + verificación completa previene esto.
7. **"Routing ≠ calidad"** (S53) → S53 arregló routing correcto pero la conversación seguía mala. Clasificar gaps por layer (routing | rendering | data | nlu) antes de investigar.
8. **"Hypothesis agent"** (S53) → fuerza perspectiva de usuario. Sin esto, el Claude evalúa como ingeniero ("action=correct ✓") en vez de como usuario ("esto suena horrible").
9. **"Fitness functions como ratchet"** (S53) → cada flow arreglado se protege permanentemente con assertions de promptfoo. Cambios futuros que rompan flows arreglados fallan el pre-commit hook automáticamente.

## What to adapt per session type

- **Flow-by-flow diagnosis**: Message 2 as-is. Workflow de 5 fases, hypothesis agent, conversation-replay.ps1.
- **PR evaluation / Round-3 (CLAUDE79+)**: Use **Message 2-R3** (framework `ROUND3-FRAMEWORK.md` + registro `ROUND3-GLOBAL-ORDER.md` + 3 gates). **Un solo loop, máxima calidad a cada PR** — el loop ya cubre colisión (paso 4) y replay de regresión (paso 5); no hay flujo "complicado" aparte. Human-in-the-loop, **sin agentes**. Audita PRs ya producidos, no re-diagnostica.
- **Design session**: Swap Message 2 for `SESSION-DESIGN-FRAMING.md` message.
- **QE measurement**: Message 2 sin diagnosis — focus en template + batch execution.
- **Deployment**: Skip Message 2 — focus en Railway deploy + POST verify production.

---
