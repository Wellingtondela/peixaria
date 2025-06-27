const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mercadopago = require('mercadopago');
const admin = require('./firebaseConfig'); // aqui você deve exportar o admin inicializado

const app = express();
const port = process.env.PORT || 3000;

const mpAccessToken = process.env.MP_ACCESS_TOKEN || 'SEU_TOKEN_MERCADO_PAGO_AQUI';
const mp = new mercadopago.SDK(mpAccessToken);

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Backend está rodando! Use /pagamento/:id?valor=XX para testar.');
});

app.get('/pagamento/:id', async (req, res) => {
  const id = req.params.id;
  const valor = parseFloat(req.query.valor) || 30;

  try {
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pagamento = {
      transaction_amount: valor,
      description: `Pedido Tilápia Peixaria SLZ #${id}`,
      payment_method_id: "pix",
      payer: { email: "cliente@email.com" },
      notification_url: "https://peixaria.onrender.com/webhook"
    };

    const pagamentoCriado = await mp.payment.create(pagamento);
    const pix = pagamentoCriado.body.point_of_interaction.transaction_data;

    await admin.firestore().collection('pedidos').doc(id).update({
      status: "aguardando pagamento",
      pagamento_id: pagamentoCriado.body.id,
      valor
    });

    res.json({
      pix_code: pix.transaction_id,
      qr_code_base64: pix.qr_code_base64
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ erro: 'Erro ao gerar pagamento', detalhes: error.message });
  }
});

app.post('/webhook', async (req, res) => {
  const pagamentoId = req.body.data?.id;
  if (!pagamentoId) {
    return res.status(400).json({ erro: 'ID do pagamento não informado' });
  }

  try {
    const pagamento = await mp.payment.findById(pagamentoId);
    if (pagamento.body.status === "approved") {
      const snapshot = await admin.firestore().collection('pedidos')
        .where("pagamento_id", "==", pagamentoId).limit(1).get();

      if (!snapshot.empty) {
        const pedidoRef = snapshot.docs[0].ref;
        await pedidoRef.update({
          status: "em preparo",
          pago_em: new Date()
        });
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ erro: 'Erro no webhook', detalhes: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
