<div align="center">

<img src="media/cockpit.svg" width="96" alt="VozIA Cockpit"/>

# 🛰️ VozIA Cockpit

**Una extensión de VS Code que orquesta mi flujo entero con Claude Code** — proyectos,
handoffs, sesiones, prompts y un **loop autónomo**, todo en un panel nativo.

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.106-007ACC?logo=visualstudiocode)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![esbuild](https://img.shields.io/badge/bundler-esbuild-FFCF00?logo=esbuild&logoColor=black)

</div>

---

Trabajo con muchos proyectos de Claude Code a la vez. Saltar entre carpetas, recuperar el
último handoff, relanzar una sesión con el contexto correcto y reusar prompts era fricción
constante. El Cockpit la elimina: **un solo panel** en la barra lateral con todo a un clic.

## ✨ Qué hace

| Vista | Para qué |
|-------|----------|
| 📁 **Proyectos** | Anclá carpetas y abrí cualquiera en una ventana nueva (o en la misma) con un clic. El proyecto activo se marca en la barra de estado. |
| 📝 **Handoffs** | Navegá los documentos de handoff de cada proyecto — el último estado de cada sesión, siempre a mano. |
| 🎬 **Sesiones** | Lista de sesiones de Claude Code, reasignables entre proyectos sin reabrir carpetas. |
| 💬 **Prompts** | Prompts reutilizables listos para pegar — el framing de sesión, los gates, lo que uses seguido. |
| 🔁 **Loop** | Un **loop autónomo**: corre Claude Code turno tras turno de forma desatendida, con su propio log de turnos y framing. |

Más un comando para **re-aplicar el parche de "Open in Folder"** del bundle de Claude Code
(se re-aplica tras cada auto-update, que de otro modo lo pisa).

## ⌨️ Atajos

| Atajo | Acción |
|-------|--------|
| `Ctrl+Alt+Shift+V` | Cambiar el proyecto activo |
| `Ctrl+Alt+Shift+C` | Iniciar sesión en el proyecto activo |

## 🚀 Correrla

```bash
npm install
npm run compile
code .
```

Dentro de VS Code, presioná `F5` y elegí **Run VozIA Cockpit**. El Extension Development Host
abre con el contenedor **VozIA Cockpit** y sus cinco vistas en la barra lateral.

## 🧱 Arquitectura

Módulos pequeños y autocontenidos bajo [`src/`](src/) — cada vista vive en su carpeta y se
registra sin tocar `package.json` ni `extension.ts`:

```
src/
├── extension.ts        # punto de entrada — registra los módulos
├── projects/           # carpetas ancladas + proyecto activo
├── handoffs/           # lectura de documentos de handoff
├── sessions/           # sesiones de Claude Code
├── prompts/            # prompts reutilizables
├── loop/               # el loop autónomo (engine, framing, turnLog, view)
├── launch/             # lanzar Claude con el handoff/template correcto
├── patch/              # re-aplicar el parche del bundle
└── util/               # helpers (claudeUri, ...)
```

Bundleada con **esbuild**, tipada con **TypeScript** (`npm run check-types`).

---

<sub>Extensión personal. Se publica como muestra del setup, no como producto soportado.</sub>
