app.get('/pagamento/:id', async (req, res) => {
  const id = req.params.id;
  const valorParam = req.query.valor;
  const valor = valorParam && !isNaN(parseFloat(valorParam)) ? parseFloat(valorParam) : 30;

  console.log("💰 Valor usado para pagamento:", valor); // debug

  try {
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pagamentoCriado = await Payment.create({
      body: {
        transaction_amount: valor,
        description: `Pedido Tilápia Peixaria SLZ #${id}`,
        payment_method_id: "pix",
        payer: { email: "cliente@email.com" },
        notification_url: "https://peixaria.onrender.com/webhook"
      },
      config: mp
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
    console.error('❌ Erro ao gerar pagamento:', error);
    res.status(500).json({ erro: 'Erro ao gerar pagamento', detalhes: error.message });
  }
});
