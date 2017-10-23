const aulas = require('./aulas');

module.exports = function process(evento, fecha, config) {
  const día = config.semana[fecha.days()];
  return `[[${aulas[evento.título][día]}]] *${evento.horario}:* ${evento.título}`;
}
