/* Config */
const eventos = require('./eventos');
const materias = require('./materias');
const config = require('./config');
const {token, semana, dueño, autorizados, formatos_fecha} = config;

/* Librerías */
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
const fs = require('fs');

const bot = new TelegramBot(token, {polling: true});

bot.onText(/^\/materias ?(-?[0-9]+)?/, comando((msg, [texto, días = 0]) => {
  const chatId = msg.chat.id;
  const fecha = moment().add(días, 'days');

  const respuesta = describir_fecha(materias, fecha, config);
  const sin_materias = `${días == 0 ? 'Hoy' : `El ${fecha.format('DD/MM')}`} no cursás nada. ¡Descansá!`;

  bot.sendMessage(chatId, respuesta || sin_materias, {parse_mode: 'markdown'});
}));

bot.onText(/^\/(sugerencia|recordar|sugerir).*/, comando(msg => {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  bot.forwardMessage(dueño, msg.chat.id, msgId);
  bot.sendMessage(chatId, 'Gracias! Ahí lo molesto a nacho.');
}));

bot.onText(/^\/(calendario|crono|cronograma|eventos) ?(-?[0-9]+)?/, comando((msg, [texto, _, días = 0]) => {
  const chatId = msg.chat.id;
  const fecha = moment().add(días, 'days');

  const respuesta = describir_fecha(materias.concat(eventos), fecha, config);
  const sin_eventos = `${días == 0 ? 'Hoy' : `El ${fecha.format('DD/MM')}`} no hay nada para hacer, que aburrido :(`;

  bot.sendMessage(chatId, respuesta || sin_eventos, {parse_mode: 'markdown'});
}));

bot.onText(/^\/agendar ([^ ]+) (.+)$/, comando((msg, [texto, fecha, título]) => {
  const chatId = msg.chat.id;
  const evento = crear_evento(fecha, título);

  if(evento instanceof Error) {
    bot.sendMessage(chatId, evento.message);
    return;
  }

  const eventoId = agregar_evento(evento, eventos);
  bot.sendMessage(chatId, `Agendado! En caso de error usá /editarevento_${eventoId}`);
}));

bot.onText(/^\/evento_([0-9]+)/, comando((msg, [texto, eventoId]) => {
  const chatId = msg.chat.id;
  const evento = eventos[eventoId];

  bot.sendMessage(chatId, describir_evento(evento, null, config), {parse_mode: 'markdown'});
}));

bot.onText(/^\/editarevento_([0-9]+) ([^ ]+) (.+)$/, comando((msg, [texto, eventoId, fecha, título]) => {
  const chatId = msg.chat.id;
  const evento = eventos[eventoId];
  const nuevoEvento = crear_evento(fecha, título);

  if(evento instanceof Error) {
    bot.sendMessage(chatId, evento.message);
    return;
  }

  for(dato in nuevoEvento) {
    evento[dato] = nuevoEvento[dato];
  }

  guardar_eventos(eventos);

  bot.sendMessage(chatId, `Modificado! Si te equivotaste de vuelta usá /editarevento_${eventoId}`);
}));

/* TODO: modularizar esto junto al resto del código */
(function() {
  const ahora = moment();
  const horario_alarma = '11:30';
  const grupos_alarma = [-235836218];
  const formato_alarma = ['hh:dd', 'hh:dd:ss'];
  const alarma = moment(horario_alarma, formato_alarma, true);

  function recordatorio() {
    const fecha = moment();
    const eventos_texto = describir_fecha(materias.concat(eventos), fecha, config);

    if(!eventos_texto) return;

    grupos_alarma.forEach(grupo =>
      bot.sendMessage(grupo, eventos_texto, {parse_mode: 'markdown'}));
  }

  if(ahora > alarma) alarma.add(1, 'days');

  setTimeout(() => {
    recordatorio();
    setInterval(recordatorio, 24*69*60*1000);
  }, alarma - ahora);
})();

function describir_fecha(eventos, fecha, config) {
  const eventos_hoy = eventos_en_calendario(eventos, fecha);

  return eventos_hoy.map(evento => describir_evento(evento, fecha, config)).join('\n');
}

function describir_evento(evento, fecha, config) {
  const plugin = evento.plugin || 'describir';
  const describir = require(`./plugins/${plugin}`);

  return describir(evento, fecha, config);
}

function eventos_en_calendario(eventos, fecha) {
  const día = semana[fecha.day()];
  const fecha_escrita = fecha.format('DD/MM/YYYY');

  const recurrentes = eventos.filter(evento => evento.tipo === 'recurrente')
                             .filter(evento => evento.recurrencia.includes(día));
  const eventuales =  eventos.filter(evento => evento.tipo === 'eventual')
                             .filter(evento => evento.fecha === fecha_escrita);

  return recurrentes.concat(eventuales).sort((a, b) => a.tipo > b.tipo
                                                    || a.tipo === b.tipo && a.cuándo > b.cuándo);
}

function agregar_evento(evento, eventos) {
  const eventoId = eventos.push(evento) - 1;
  guardar_eventos(eventos);
  return eventoId;
}

/* TODO: Soportar otros tipos de fechas para crear */
function crear_evento(texto_fecha, título, tipo = 'eventual') {
  const fecha = moment(texto_fecha, formatos_fecha, true);

  if(!fecha.isValid()) return new Error(`No se reconoció la fecha ${texto_fecha}`);
  if(título.length < 5) return new Error(`¿Un título de ${título.length} letras? ¿Me estás cargando?`);

  const fecha_escrita = fecha.format('DD/MM/YYYY');

  return {
    tipo: tipo,
    título: título,
    fecha: fecha_escrita,
    cuándo: fecha_escrita
  };
}

function guardar_eventos(eventos) {
  fs.writeFile('./eventos.json', JSON.stringify(eventos, null, 2), err => {
    if(err) console.error('---- Hubo un error guardando los eventos ----');
  });
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
