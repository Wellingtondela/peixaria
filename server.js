const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseConfig');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const mpAccessToken = process.env.MP_ACCESS_TOKEN || 'SEU_TOKEN_AQUI';
const mp = new MercadoPagoConfig({ accessToken: mpAccessToken });

app.get('/', (req, res) => {
  res.send('Backend está rodando! Use /pagamento/:id?valor=XX');
});

app.get('/pagamento/:id', async (req, res) => {
  const id = req.params.id;
  const valorParam = req.query.valor;
  const valor = valorParam && !isNaN(parseFloat(valorParam)) ? parseFloat(valorParam) : 30;

  try {
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const payment = new Payment(mp); // ✅ instanciando corretamente
    const pagamentoCriado = await payment.create({
      transaction_amount: valor,
      description: `Pedido Tilápia Peixaria SLZ #${id}`,
      payment_method_id: "pix",
      payer: { email: "cliente@email.com" },
      notification_url: "https://peixaria.onrender.com/webhook"
    });

    const pix = pagamentoCriado.point_of_interaction?.transaction_data;

    if (!pix) {
      return res.status(500).json({ erro: 'Erro ao gerar dados PIX.' });
    }

    await admin.firestore().collection('pedidos').doc(id).update({
      status: "aguardando pagamento",
      pagamento_id: pagamentoCriado.id,
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

app.listen(port, () => {
  console.log(`✅ Servidor rodando na porta ${port}`);
});
