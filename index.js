//let debug = require('debug');
//debug.enable('*');
const _        = require('lodash');
const express  = require('express');
const morgan   = require('morgan');
const app      = express();
const RedisSMQ = require('rsmq');

let redisConfig = {
  host:     '127.0.0.1',
  port:     6379,
  password: undefined,
};
if (process.env.NODE_ENV !== 'dev') {
  redisConfig = {
    host:     process.env.REDIS_HOST,
    port:     process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  };
}

const rsmq = new RedisSMQ({
  host:     redisConfig.host,
  port:     redisConfig.port,
  options:  { password: redisConfig.password },
  ns:       'rsmq',
  realtime: true,
});

app.use(morgan('combined'));
app.use(express.json());

app.get('/dequeue/:key', async (req, res) => {
  if (_.isEmpty(req.params) || _.isEmpty(req.params.key)) {
    return res.sendStatus(400);
  }
  try {await rsmq.createQueueAsync({ qname: req.params.key });} catch (e) {}
  const resp = await rsmq.popMessageAsync({ qname: req.params.key });
  res.json(resp.id ? resp : []);
});

app.post('/enqueue/:key', async (req, res) => {
  if (_.isEmpty(req.params) || _.isEmpty(req.body)) {
    return res.sendStatus(400);
  }
  try {await rsmq.createQueueAsync({ qname: req.params.key });} catch (e) {}
  const resp = await rsmq.sendMessageAsync({
    qname:   req.params.key,
    message: _.isString(req.body) ? req.body : JSON.stringify(req.body),
  });
  res.json(resp);
});

app.listen(3535);