const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseConfig');
const fetch = require('node-fetch'); // ou global.fetch se seu ambiente já tem
const mpAccessToken = process.env.MP_ACCESS_TOKEN || 'SEU_TOKEN_AQUI';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.post('/pagamento/:id', async (req, res) => {
  const id = req.params.id;

  try {
    // Busca pedido no Firestore
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();

    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    const pedido = pedidoDoc.data();

    // Pega valor do pedido do banco, para garantir integridade
    const valor = pedido.valor;
    if (!valor || valor <= 0) {
      return res.status(400).json({ erro: 'Valor do pedido inválido' });
    }

    // Cria idempotency key para evitar pagamentos duplicados
    const idempotencyKey = Date.now().toString();

    // Cria pagamento no Mercado Pago via API
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(valor),
        description: `Pedido Tilápia Peixaria SLZ #${id}`,
        payment_method_id: 'pix',
        payer: {
          email: "cliente@peixaria.com", // ou pegue do pedido se tiver
        },
        notification_url: "https://peixaria.onrender.com/webhook"
      })
    });

    const data = await response.json();

    if (!data.point_of_interaction) {
      console.error('Erro ao gerar pagamento Mercado Pago:', data);
      return res.status(500).json({ erro: 'Erro ao gerar dados PIX.' });
    }

    // Atualiza pedido com status e dados do pagamento
    await admin.firestore().collection('pedidos').doc(id).update({
      status: 'aguardando pagamento',
      pagamento_id: data.id,
      valor
    });

    // Retorna dados para frontend mostrar QR Code e código Pix
    res.json({
      pix_code: data.point_of_interaction.transaction_data.transaction_id,
      qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ erro: 'Erro ao gerar pagamento', detalhes: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
