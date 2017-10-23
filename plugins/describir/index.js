const aulas = require('./aulas');

module.exports = function process(evento) {
  return `*${evento.horario}:* ${evento.título}`;
}
