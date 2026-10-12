import { register } from 'node:module'

register('./hooks.mjs', { parentURL: import.meta.url })
