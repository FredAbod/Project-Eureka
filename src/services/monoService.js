/**
 * Mono Service Facade Export
 * This file replaces the old monolithic MonoService class.
 * It now exports the modular facade from src/services/mono/index.js,
 * maintaining backward compatibility with the rest of the application.
 */
const monoService = require("./mono/index");

module.exports = monoService;
