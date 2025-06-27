const express = require('express');
const mercadopago = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

const mp = new mercadopago.SDK(process.env.MP_ACCESS_TOKEN);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

module.exports = app;
