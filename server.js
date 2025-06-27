const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('./firebaseConfig');
const { MercadoPagoConfig } = require('mercadopago');

const app = express();
const port = process.env.PORT || 3000;

const fetch = global.fetch;

const mpAccessToken = process.env.MP_ACCESS_TOKEN || 'SEU_TOKEN_AQUI';

// Inicializa o Mercado Pago
const client = new MercadoPagoConfig({ accessToken: mpAccessToken });

app.use(cors());
app.use(bodyParser.json());

// Rota raiz para teste básico
app.get('/', (req, res) => {
  res.send('Backend Peixaria rodando! Use POST /pagamento/:id para criar pagamentos.');
});

// Criar pagamento PIX
app.post('/pagamento/:id', async (req, res) => {
  const id = req.params.id;
  // Pode receber valor via query ou corpo
  const valorParam = req.query.valor || req.body.valor;
  const valor = valorParam && !isNaN(parseFloat(valorParam)) ? parseFloat(valorParam) : null;

  if (!valor) {
    return res.status(400).json({ erro: 'Valor inválido ou não informado.' });
  }

  try {
    // Busca o pedido no Firestore para pegar telefone/email para o pagador
    const pedidoDoc = await admin.firestore().collection('pedidos').doc(id).get();
    if (!pedidoDoc.exists) {
      return res.status(404).json({ erro: 'Pedido não encontrado.' });
    }
    const pedido = pedidoDoc.data();

    const telefone = pedido.whatsapp || '00000000000';
    const email = pedido.email || 'cliente@peixaria.com';

    const idempotencyKey = Date.now().toString();

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: `Pedido Peixaria SLZ #${id}`,
        payment_method_id: 'pix',
        payer: {
          email: email,
          first_name: pedido.nome || 'Cliente',
          last_name: telefone
        },
        external_reference: id // pode usar o id do pedido como referência
      })
    });

    const data = await response.json();

    if (!data.point_of_interaction) {
      console.error('Erro no retorno do Mercado Pago:', data);
      return res.status(500).json({ erro: 'Erro ao obter informações de pagamento.', detalhes: data });
    }

    // Atualiza o pedido com status e id do pagamento
    await admin.firestore().collection('pedidos').doc(id).update({
      status: "aguardando pagamento",
      pagamento_id: data.id,
      valor
    });

    res.json({
      pix_code: data.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64,
      payment_id: data.id
    });

  } catch (error) {
    console.error('Erro ao gerar pagamento PIX:', error);
    res.status(500).json({ erro: 'Erro ao gerar pagamento PIX.', detalhes: error.message });
  }
});

// Webhook Mercado Pago para atualizar status
app.post('/webhook', async (req, res) => {
  const data = req.body;

  try {
    if (data.type === 'payment' && data.data?.id) {
      const paymentId = data.data.id;

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`
        }
      });

      const payment = await response.json();

      if (payment.status === 'approved') {
        const pedidoId = payment.external_reference;

        await admin.firestore().collection('pedidos').doc(pedidoId).update({
          status: "pago",
          pago_em: new Date(),
          payment_id: paymentId
        });

        console.log(`Pagamento aprovado para pedido ${pedidoId}`);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
