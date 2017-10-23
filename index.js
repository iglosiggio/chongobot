/* Config */
const eventos = require('./eventos');
const materias = require('./materias');
const config = require('./config');
const {token, semana, dueño, autorizados} = config;

/* Librerías */
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');

const bot = new TelegramBot(token, {polling: true});

bot.onText(/^\/materias ?(-?[0-9]+)?/, comando((msg, [texto, días = 0]) => {
  const chatId = msg.chat.id;
  const fecha = moment().add(días, 'days');
  const materias_hoy = eventos_en_calendario(materias, fecha);

  const sin_materias = `${días == 0 ? 'Hoy' : `El ${fecha.format('DD/MM')}`} no cursás nada. ¡Descansá!`;

  const respuesta = materias_hoy.map(materia => {
    const plugin = materia.plugin || 'describir';
    const describir = require(`./plugins/${plugin}`);

    return describir(materia, fecha, config);
  }).join('\n');

  bot.sendMessage(chatId, respuesta || sin_materias, {parse_mode: 'markdown'});
}));

bot.onText(/^\/(sugerencia|recordar|sugerir).*/, comando(msg => {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  bot.forwardMessage(dueño, msg.chat.id, msgId);
  bot.sendMessage(chatId, 'Gracias! Ahí lo molesto a nacho.');
}));

function eventos_en_calendario(eventos, fecha) {
  const día = semana[fecha.day()];
  const fecha_escrita = fecha.format('DD/MM/YYYY');

  const recurrentes = eventos.filter(evento => evento.tipo === 'recurrente')
                             .filter(evento => evento.recurrencia.includes(día));
  const eventuales =  eventos.filter(evento => evento.tipo === 'eventual')
                             .filter(evento => evento.fecha === fecha_escrita)

  return recurrentes.concat(eventuales).sort((a, b) => a.horario > b.horario); 
}

function mensaje_autorizado(msg) {
  const possibles_ids = [msg.chat.id, msg.chat.username, msg.from.id, msg.from.username];
  return possibles_ids.some(id => autorizados.includes(id));
}

function log(msg) {
  const {from, chat} = msg
  console.info(`[${from.username}:${msg.from.id}->${chat.username}:${chat.id}] ${msg.text}`);
}

function comando(cmd) {
  return (msg, ...args) => {
    log(msg);
    if(!mensaje_autorizado(msg)) {
      console.error('\t\t^^^ MENSAJE NO AUTORIZADO ^^^');
      return;
    }
    return cmd(msg, ...args);
  }
}
