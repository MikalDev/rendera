# [Plugin] Addon bare-bones

There is a Lost bare-bones project for 'plugin' addon type.

<!-- ## Installation
Use `lost create --plugin` -->

## Development
- Use `deno task build` OR `lost build` to build addon.
- Use `deno task serve` OR `lost serve` to build AND start web development server for testing addon.

- Changes
    - main.js fixes runtime scripts
    - from \\ from draco in plugin.js (move out of subfolder?)
    - change export of gl-matrix.js to use named exports and not factory function
    - change import of glMatrix to use named imports
        - import { mat4 } from './modules/gl-matrix.js';
    - change runtime to use WebGLRenderer instead of WebGL2Renderer

    main.js
    import "./plugin.js"
    import "./type.js"
    import "./instance.js"
    import "./actions.js"
    import "./conditions.js"
    import "./expressions.js"
