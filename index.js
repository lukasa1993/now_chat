const _       = require('lodash');
const EC      = require('elliptic').ec;
const EdDSA   = require('elliptic').eddsa;
const express = require('express');
const keccak  = require('keccakjs');
const app     = express();
app.use(express.json());

const sessions = {};
const CURVE    = 'curve25519';
const CURVE_ED = 'ed25519';

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

const pullMessage = async sender => {
  const tick  = 100;
  let timeout = 10000;

  while (timeout > 0) {
    if (sessions.hasOwnProperty(sender) && _.isArray(sessions[sender].messages)) {
      const messages            = _.cloneDeep(sessions[sender].messages);
      sessions[sender].messages = [];
      return messages;
    } else {
//      console.log('pullMessage', sender, JSON.stringify(sessions));
    }

    await snooze(tick);
    timeout -= tick;
  }

  return null;
};

const pullAuth = async (sender, recipient) => {
  const tick  = 100;
  let timeout = 10000;

  while (timeout > 0) {

    if (sessions.hasOwnProperty(sender) && sessions.hasOwnProperty(recipient)) {
      if (sender === sessions[recipient].recipient) {
        return true;
      }
    }

    await snooze(tick);
    timeout -= tick;
  }

  return false;
};

const initSession = payload => sessions.hasOwnProperty(payload.sender) ? sessions[payload.sender] : (sessions[payload.sender] = {
  pubKey:    payload.signature.key,
  recipient: null,
  messages:  [],
});
const addMessage  = (recipient, message) => {
  if (sessions.hasOwnProperty(recipient) && _.isArray(sessions[recipient].messages)) {
    sessions[recipient].messages.push(message);
  }
};

const handlePull = async (req, res) => {
  const payload = req.body;

  switch (req.body.pull_type) {
    case 'messages':
      const messages = await pullMessage(req.body.sender);
      if (_.isEmpty(messages) === false) {
        return res.json({
          action: 'message',
          messages,
        });
      }
      break;
    case 'auth':
      const auth = await pullAuth(payload.sender, sessions[payload.sender].recipient);
      if (auth) {
        return res.json({ action: 'connected' });
      }
  }

  res.json({ action: 'noop' });
};

const verifySender = (payload) => {
  if (payload.hasOwnProperty('sender') === false || payload.hasOwnProperty('signature') === false) {
    console.log('Empty Payload');
    return false;
  }
  initSession(payload);

  const ED   = new EdDSA(CURVE_ED);
  const keys = ED.keyFromPublic(sessions[payload.sender].pubKey);

  const withoutSignature = _.cloneDeep(payload);
  delete withoutSignature.signature;

  const msg = JSON.stringify(withoutSignature);

  const msgHash = new keccak().update(msg).digest('hex');
  return keys.verify(msgHash, payload.signature.sign);
};

app.post('*', async (req, res) => {
  const payload = req.body;

  const verified = verifySender(payload);
  if (verified === false) {
    console.log('bad payload', JSON.stringify(payload));
    return res.json({ 'action': 'fuck_off' });
  }

  switch (payload.action) {
    case 'auth':
      sessions[payload.sender].recipient = payload.recipient;
      return res.json({ 'action': 'wait_recipient' });
    case 'message':
      addMessage(payload.recipient, payload.message);
      res.json({ action: 'message_received' });
      break;
    case 'pull':
      return await handlePull(req, res);
    default:
      return res.json({ 'action': 'not_implemented' });
  }
});

module.exports = app;
