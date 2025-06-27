// Express + Mercado Pago SDK
const express = require('express');
const router = express.Router();
const mercadopago = require('mercadopago');
const admin = require('firebase-admin');

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// Gerar pagamento Pix com valor fixo (ou com base no pedido)
router.get('/pagamento/:id', async (req, res) => {
  const { id } = req.params;

  const pagamento = {
    transaction_amount: 30, // ou pegue o valor do Firestore
    description: "Pedido Tilápia Peixaria SLZ",
    payment_method_id: "pix",
    payer: { email: "cliente@email.com" },
    notification_url: "https://SEU_BACKEND_RENDER/webhook"
  };

  try {
    const pagamentoCriado = await mercadopago.payment.create(pagamento);
    const pix = pagamentoCriado.body.point_of_interaction.transaction_data;

    // Salva no pedido no Firestore
    await admin.firestore().collection('pedidos').doc(id).update({
      status: "aguardando pagamento",
      pagamento_id: pagamentoCriado.body.id
    });

    res.json({
      pix_code: pix.transaction_id,
      qr_code_base64: pix.qr_code_base64
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao gerar pagamento", detalhes: error.message });
  }
});
router.post('/webhook', async (req, res) => {
  const pagamentoId = req.body.data?.id;

  try {
    const pagamento = await mercadopago.payment.findById(pagamentoId);

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
  } catch (err) {
    res.status(500).json({ erro: "Erro no webhook", detalhes: err.message });
  }
});

module.exports = router;
