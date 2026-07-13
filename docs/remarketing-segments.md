# Segmentos de remarketing

As views abaixo ficam no schema privado e não são expostas ao navegador:

- `private.leads_without_whatsapp_click`: capturados que não clicaram no grupo.
- `private.leads_without_sales_page`: entraram no grupo, mas não chegaram à oferta.
- `private.checkout_abandoners`: chegaram ao checkout sem pedido aprovado.
- `private.pending_payments`: pagamentos aguardando conclusão.
- `private.customers_without_upsell`: clientes do produto principal sem upsell aceito.
- `private.upsell_decliners`: recusaram a oferta adicional.

O uso dessas listas deve respeitar a finalidade original e o consentimento de marketing. Ferramentas externas devem receber apenas os campos estritamente necessários.

Os novos campos opcionais permitem análises por nicho, estágio, audiência, desafio, objetivo e período preferido de contato. Eles não devem ser usados para decisões automatizadas sensíveis nem compartilhados fora da finalidade informada.
