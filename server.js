const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseConfig');
const { Payment, configure } = require('mercadopago');

configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Backend está rodando! Use /pagamento/:id?valor=XX');
});

app.get('/pagamento/:id', async (req, res) => {
  const id = req.params.id;
  const valor = parseFloat(req.query.valor) || 30;

  try {
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pagamentoCriado = await Payment.create({
      transaction_amount: valor,
      description: `Pedido Tilápia Peixaria SLZ #${id}`,
      payment_method_id: "pix",
      payer: { email: "cliente@email.com" },
      notification_url: "https://peixaria.onrender.com/webhook"
    });

    const pix = pagamentoCriado.body?.point_of_interaction?.transaction_data;
    if (!pix) {
      throw new Error("Erro ao gerar QR Code Pix.");
    }

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
    console.error('Erro ao gerar pagamento:', error.message || error);
    res.status(500).json({ erro: 'Erro ao gerar pagamento', detalhes: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
