const express = require('express');
const router = express.Router();
const mercadopago = require('mercadopago');
const admin = require('firebase-admin');

// Configurar token Mercado Pago corretamente (v2+)
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);

// Rota para gerar pagamento PIX com valor fixo (30)
router.get('/pagamento/:id', async (req, res) => {
  const { id } = req.params;

  const pagamento = {
    transaction_amount: 30, // ou buscar o valor real do pedido no Firestore
    description: "Pedido Tilápia Peixaria SLZ",
    payment_method_id: "pix",
    payer: { email: "cliente@email.com" }, // ideal: pegar o email do cliente dinâmico
    notification_url: "https://peixaria.onrender.com/webhook"
  };

  try {
    const pagamentoCriado = await mercadopago.payment.create(pagamento);
    const pix = pagamentoCriado.body.point_of_interaction.transaction_data;

    // Atualiza pedido no Firestore com status e id do pagamento
    await admin.firestore().collection('pedidos').doc(id).update({
      status: "aguardando pagamento",
      pagamento_id: pagamentoCriado.body.id
    });

    // Retorna dados do QR Code para o cliente pagar
    res.json({
      pix_code: pix.transaction_id,
      qr_code_base64: pix.qr_code_base64
    });
  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ erro: "Erro ao gerar pagamento", detalhes: error.message });
  }
});

// Webhook para atualizar status do pedido após pagamento aprovado
router.post('/webhook', async (req, res) => {
  const pagamentoId = req.body.data?.id;

  if (!pagamentoId) {
    return res.status(400).json({ erro: "ID do pagamento não informado" });
  }

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
    console.error('Erro no webhook:', err);
    res.status(500).json({ erro: "Erro no webhook", detalhes: err.message });
  }
});

module.exports = router;
