/* Config */
const eventos = require('./eventos');
const materias = require('./materias');
const config = require('./config');
const {token, semana, dueño, autorizados, formatos_fecha} = config;

/* Librerías */
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
const fs = require('fs');
const crypto = require('crypto');

/* Use internal promises */
TelegramBot.promise = Promise;

const bot = new TelegramBot(token, {polling: true});

bot.onText(/^\/materias ?(-?[0-9]+)?/, comando((msg, [texto, días = 0]) => {
  const chatId = msg.chat.id;
  const fecha = moment().add(días, 'days');

  const respuesta = describir_fecha(materias, fecha, config);
  const sin_materias = `${días == 0 ? 'Hoy' : `El ${fecha.format('DD/MM')}`} no cursás nada. ¡Descansá!`;

  return bot.sendMessage(chatId, respuesta || sin_materias, {parse_mode: 'markdown'})
            .catch(log_catch('materias'));
}));

bot.onText(/^\/(sugerencia|recordar|sugerir).*/, comando(msg => {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  const fw = bot.forwardMessage(dueño, msg.chat.id, msgId)
                .catch(log_catch('sugerir_forward');
  const respuesta = bot.sendMessage(chatId, 'Gracias! Ahí lo molesto a nacho.')
                       .catch(log_catch('sugerir_mensaje'));
  return Promise.all([fw, respuesta]);
}));

bot.onText(/^\/(calendario|crono|cronograma|eventos) ?(-?[0-9]+)?/, comando((msg, [texto, _, días = 0]) => {
  const chatId = msg.chat.id;
  const fecha = moment().add(días, 'days');

  const respuesta = describir_fecha(materias.concat(eventos), fecha, config);
  const sin_eventos = `${días == 0 ? 'Hoy' : `El ${fecha.format('DD/MM')}`} no hay nada para hacer, que aburrido :(`;

  return bot.sendMessage(chatId, respuesta || sin_eventos, {parse_mode: 'markdown'})
            .catch(log_catch('calendario'));
}));

bot.onText(/^\/agendar ([^ ]+) (.+)$/, comando((msg, [texto, fecha, título]) => {
  const chatId = msg.chat.id;
  const evento = crear_evento(fecha, título);

  if(evento instanceof Error) {
    return bot.sendMessage(chatId, evento.message)
              .catch(log_catch('agendar_error'));
  }

  const evento_texto = describir_evento(evento, null, config);
  const eventoId = agregar_evento(evento, eventos);

  return bot.sendMessage(chatId, `${evento_texto}\n\nAgendado! En caso de error usá /editarevento\\_${eventoId}`, {parse_mode: 'markdown'})
            .catch(log_catch('agendar'));
}));

bot.onText(/^\/(evento|verevento)_([0-9]+)/, comando((msg, [texto, verbo, eventoId]) => {
  const chatId = msg.chat.id;
  const evento = eventos[eventoId];

  return bot.sendMessage(chatId, describir_evento(evento, null, config), {parse_mode: 'markdown'})
            .catch(log_catch('verevento'));
}));

bot.onText(/^\/editarevento_([0-9]+) ([^ ]+) (.+)$/, comando((msg, [texto, eventoId, fecha, título]) => {
  const chatId = msg.chat.id;
  const evento = eventos[eventoId];
  const nuevoEvento = crear_evento(fecha, título);

  if(evento instanceof Error) {
    return bot.sendMessage(chatId, evento.message)
              .catch('editarevento_error');
  }

  for(dato in nuevoEvento) {
    evento[dato] = nuevoEvento[dato];
  }

  const evento_texto = describir_evento(evento, null, config);

  guardar_eventos(eventos);

  return bot.sendMessage(chatId, `${evento_texto}\nModificado! Si te equivocaste de vuelta usá /editarevento\\_${eventoId}`, {parse_mode: 'markdown'})
            .catch(log_catch('editarevento'));
}));

bot.onText(/^\/(pregunta|preguntar) (.+)/, comando((msg, [texto, verbo, pregunta]) => {
  const chatId = msg.chat.id;
  const hash = crypto.createHash('sha256');

  pregunta.replace(/¡|!|¿|\?/g, '')
          .toLowerCase()
          .split(/ |\n|\t/)
          .sort()
          .forEach(palabra => hash.update(palabra));

  const hash_index = hash.digest('hex')[0];

  const respuestas = {
    "0": "Obvio!",
    "1": "Yup.",
    "2": "La probabilidad de eso es aproximadamente de 3720 a 1",
    "3": "Por su pollo",
    "4": "Sí.",
    "5": "Yo creo que sí Kent",
    "6": "Q c sho",
    "7": "OBVIO QUE SÍ; yo si estuviera en tu lugar no hubiera dudado como un gil",
    "8": "Jamás",
    "9": "No.",
    "a": "Ni en pedo",
    "b": "Estaría copado, no?",
    "c": "Interesante,\ninteresante.\n\n\nNo.",
    "d": "Quiero creer que no",
    "e": "Lo dudo mucho",
    "f": "No lo creo",
  };

  return bot.sendMessage(chatId, respuestas[hash_index])
            .catch(log_catch('preguntar'));
}));

/* TODO: modularizar esto junto al resto del código */
(function() {
  const ahora = moment();
  const formato_alarma = ['hh:mm', 'hh:mm:ss'];
  const {horario, grupos} = config.alarma;
  const alarma = moment(horario, formato_alarma, true);

  function recordatorio() {
    const fecha = moment();
    const eventos_texto = describir_fecha(materias.concat(eventos), fecha, config);

    if(!eventos_texto) return;

    const mensajes = grupos.map(grupo =>
      bot.sendMessage(grupo, eventos_texto, {parse_mode: 'markdown'}))
         .catch(log_catch(`alarma_${grupo}`));

    return Promise.all(mensajes);
  }

  if(ahora > alarma) alarma.add(1, 'days');

  setTimeout(() => {
    recordatorio();
    setInterval(recordatorio, 24*60*60*1000);
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

function log_catch(lugar) {
  return function(error) {
    console.error(``[ERROR:${lugar}]`, error.message, error.code)
  }
}
