import { defineConfig } from "./deps.ts";

export default defineConfig<'plugin'>({
    type: 'plugin',
    pluginType: 'object',
    // deprecated?: boolean;
    // minConstructVersion?: string;
    // canBeBundled?: boolean;
    isSingleGlobal: true,
    objectName: 'Rendera',

    addonId: 'rendera',
    category: 'general',
    addonName: 'Rendera',
    addonDescription: 'Rendera is a 3D renderer.',
    version: '1.2.0',
    author: 'Mikal',
    docsUrl: 'https://kindeyegames.itch.io/rendera',
    helpUrl: {
        EN: 'https://kindeyegames.itch.io/rendera'
    },
    websiteUrl: 'https://kindeyegames.itch.io/rendera'
})
