<?php
declare(strict_types=1);

/**
 * Modelos INICIAIS (rascunho) dos documentos jurídicos. NÃO constituem aconselhamento jurídico:
 * devem ser revisados, completados e aprovados por advogado antes da publicação.
 * Campos entre [COLCHETES] precisam ser preenchidos.
 */
return [
    ['slug' => 'privacy', 'category' => 'lgpd', 'title' => 'Política de Privacidade', 'required' => 1, 'content' => <<<'TXT'
# Política de Privacidade

**Controlador:** [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. **Encarregado (DPO):** [NOME] — [E-MAIL DO ENCARREGADO].

## 1. Dados que tratamos
- Cadastro: nome, e-mail, senha (armazenada apenas como hash), idioma, telefone e endereço (opcionais).
- Dados de saúde (anamnese, PAR-Q, lesões, objetivo, medidas): **dados pessoais sensíveis** (LGPD, art. 11), criptografados em repouso.
- Treino: aulas concluídas, esforço percebido, constância, pontos e conquistas.
- Pagamento: valor, data, meio e situação. Dados de cartão são tratados pelo provedor de pagamento e **não** passam pelos nossos servidores.
- Acesso: dispositivo/navegador e um hash do endereço IP, para segurança e auditoria.

## 2. Finalidades e bases legais
- Prestar o serviço de treinos e personalizar o método — execução de contrato (art. 7º, V).
- Tratar dados de saúde — consentimento específico e destacado (art. 11, I).
- Cobrança e obrigações fiscais — obrigação legal e execução de contrato.
- Segurança, prevenção a fraude e auditoria — legítimo interesse (art. 7º, IX).
- Comunicações de marketing — consentimento, revogável a qualquer momento.

## 3. Compartilhamento
Compartilhamos dados com operadores estritamente necessários: hospedagem ([HOSPEDAGEM]), DNS/CDN ([CDN]), e-mail transacional ([PROVEDOR SMTP]) e gateways de pagamento ([GATEWAYS]). Professores vinculados ao aluno veem apenas progresso de treino, **nunca** a anamnese. Não vendemos dados pessoais.

## 4. Transferência internacional
[DESCREVER, se houver, e a salvaguarda adotada — art. 33 da LGPD.]

## 5. Retenção
Mantemos os dados enquanto a conta estiver ativa e pelos prazos legais após o encerramento ([PRAZOS]). Ao excluir a conta, anamnese, progresso e consultas são apagados; registros de auditoria permanecem sem vínculo ao titular.

## 6. Seus direitos (art. 18)
Confirmação, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento, revogação do consentimento e eliminação. No app: Perfil > Privacidade (exportar e excluir). Demais pedidos: [E-MAIL DO ENCARREGADO].

## 7. Segurança
Criptografia de dados de saúde, senhas com Argon2id, sessões com cookies HttpOnly, limite de tentativas, trilha de auditoria e segregação de acessos.

## 8. Cookies
Veja a Política de Cookies.

## 9. Alterações
Publicaremos novas versões nesta página, com data. Mudanças relevantes exigirão novo aceite.

*Versão em rascunho — pendente de revisão jurídica.*
TXT],
    ['slug' => 'terms', 'category' => 'contratos', 'title' => 'Termos de Uso', 'required' => 1, 'content' => <<<'TXT'
# Termos de Uso

## 1. Aceite
Ao criar uma conta no THE FULL SCULPT você concorda com estes Termos e com a Política de Privacidade.

## 2. O serviço
Plataforma de videoaulas e acompanhamento de treinos organizados em 9 fases (3 níveis × 3 intensidades), com recursos de gamificação, relatórios e, opcionalmente, consultas online com professores.

## 3. Conta
Você é responsável pela veracidade dos dados e pela confidencialidade da senha. É vedado compartilhar o acesso. Menores de 18 anos só podem usar o serviço com autorização e acompanhamento de responsável legal.

## 4. Planos e pagamento
A primeira aula é gratuita. O acesso completo exige assinatura mensal recorrente, cobrada no valor vigente informado no checkout. Preços podem mudar com aviso prévio de [PRAZO] dias.

## 5. Cancelamento e reembolso
Conforme a Política de Cancelamento e Reembolso e o Código de Defesa do Consumidor (direito de arrependimento em 7 dias nas contratações a distância).

## 6. Propriedade intelectual
Vídeos, método, textos, marcas e modelos 3D pertencem a [RAZÃO SOCIAL] ou a seus licenciantes. É proibido copiar, redistribuir ou gravar o conteúdo.

## 7. Conduta
É vedado uso indevido, tentativa de acesso não autorizado, engenharia reversa e publicação de conteúdo ilícito nos recursos de comunidade.

## 8. Limitação de responsabilidade
Veja o Aviso de Saúde. Na extensão permitida em lei, [RAZÃO SOCIAL] não responde por danos decorrentes de uso inadequado das orientações.

## 9. Foro
Comarca de [CIDADE/UF], ressalvado o foro do consumidor.

*Rascunho — pendente de revisão jurídica.*
TXT],
    ['slug' => 'health', 'category' => 'saude', 'title' => 'Aviso de Saúde e Isenção de Responsabilidade (Disclaimer)', 'required' => 1, 'content' => <<<'TXT'
# Aviso de Saúde e Isenção de Responsabilidade

- O conteúdo do THE FULL SCULPT é educativo e **não substitui** avaliação, diagnóstico ou acompanhamento médico, fisioterapêutico ou nutricional.
- **Consulte um médico antes de iniciar** qualquer programa de exercícios, principalmente se você tem doença cardíaca, hipertensão, diabetes, gestação, lesões, dor ou outra condição de saúde.
- Se o questionário de prontidão (PAR-Q) indicar risco, o sistema orienta liberação médica e inicia na fase mais leve. Isso é uma triagem automática, não um laudo.
- Interrompa o exercício e procure atendimento em caso de dor no peito, falta de ar, tontura, desmaio ou dor aguda.
- Resultados variam de pessoa para pessoa e **não são garantidos**.
- O aluno é responsável por executar os movimentos dentro dos próprios limites e por usar espaço e equipamento seguros.
- As consultas online com professores têm caráter orientativo de treino e não configuram ato médico.

*Rascunho — pendente de revisão jurídica (inclui conferir exigências do CREF e do CFM aplicáveis).*
TXT],
    ['slug' => 'consent_health', 'category' => 'lgpd', 'title' => 'Termo de Consentimento para Dados de Saúde', 'required' => 1, 'content' => <<<'TXT'
# Termo de Consentimento para Tratamento de Dados Pessoais Sensíveis (Saúde)

Eu autorizo [RAZÃO SOCIAL] a tratar meus **dados de saúde** informados na anamnese e no questionário PAR-Q (condições, lesões, medicações, objetivo, medidas e histórico de treino) **exclusivamente** para:
1. definir minha fase inicial e adaptar os movimentos às minhas restrições;
2. gerar relatórios de evolução para mim;
3. quando eu optar pela consulta online, permitir ao professor responsável orientar meu treino.

Esses dados são armazenados criptografados, não são vendidos e não são usados para publicidade. Posso **revogar** este consentimento e **excluir** meus dados a qualquer momento em Perfil > Privacidade, sem prejuízo do tratamento já realizado.

*Rascunho — pendente de revisão jurídica. Este texto é exibido no cadastro; a versão publicada fica registrada com data e hash do IP.*
TXT],
    ['slug' => 'cookies', 'category' => 'lgpd', 'title' => 'Política de Cookies', 'required' => 0, 'content' => <<<'TXT'
# Política de Cookies

- **Estritamente necessários:** cookie de sessão (`tfs_session`, HttpOnly) para manter você conectado. Sem ele o serviço não funciona.
- **Preferências:** idioma e opção de som, guardados no seu navegador (armazenamento local).
- **Análise e marketing:** [NÃO USADOS / DESCREVER FERRAMENTAS, SE HOUVER].

Você pode apagar os dados do site no navegador a qualquer momento; isso encerra sua sessão.

*Rascunho — pendente de revisão jurídica.*
TXT],
    ['slug' => 'refund', 'category' => 'contratos', 'title' => 'Política de Cancelamento e Reembolso', 'required' => 1, 'content' => <<<'TXT'
# Política de Cancelamento e Reembolso

- Você pode cancelar a assinatura quando quiser em Perfil > Pagamentos; o cancelamento impede novas cobranças.
- **Direito de arrependimento:** em até 7 dias corridos da contratação, reembolso integral (CDC, art. 49).
- Após esse prazo, [DEFINIR: sem reembolso proporcional / proporcional ao período não utilizado].
- Estornos seguem os prazos do meio de pagamento (cartão: até [X] faturas; Pix: até [X] dias úteis).
- Cobranças indevidas ou duplicadas são reembolsadas integralmente.

*Rascunho — pendente de revisão jurídica.*
TXT],
    ['slug' => 'teachers', 'category' => 'contratos', 'title' => 'Termo de Parceria para Professores (Indicação e Comissão)', 'required' => 1, 'content' => <<<'TXT'
# Termo de Parceria para Professores

## 1. Natureza
Parceria comercial **sem vínculo empregatício, societário ou de representação**. O professor atua como profissional autônomo/PJ, com registro regular no CREF.

## 2. Indicação e comissão
- Alunos que criarem conta pelo link ou código do professor ficam vinculados a ele.
- Comissão **recorrente** sobre cada mensalidade efetivamente paga, em faixa por número de alunos ativos (valores vigentes definidos no painel administrativo).
- Carência de [DIAS] dias para proteger contra estornos; pagamento mensal após aprovação.
- Não há comissão sobre indicação de outros professores (um nível apenas).

## 3. Dados dos alunos
O professor acessa apenas progresso de treino dos alunos vinculados, **sem dados de saúde**. É proibido copiar, exportar ou usar esses dados fora da plataforma, em observância à LGPD.

## 4. Conduta e responsabilidade técnica
Orientações dentro da competência profissional; proibida promessa de resultados e prescrição médica/nutricional.

## 5. Encargos fiscais
O professor é responsável por emitir documento fiscal e recolher os tributos incidentes sobre os valores recebidos.

## 6. Rescisão
Por qualquer parte, com aviso de [DIAS] dias; comissões já aprovadas são pagas.

*Rascunho — pendente de revisão jurídica (trabalhista, tributária e de afiliados).*
TXT],
    ['slug' => 'dpo', 'category' => 'lgpd', 'title' => 'Encarregado (DPO) e Canal do Titular', 'required' => 1, 'content' => <<<'TXT'
# Encarregado pelo Tratamento de Dados Pessoais (DPO)

- **Encarregado:** [NOME]
- **Canal do titular:** [E-MAIL] — resposta em até [15] dias.
- **Como exercer direitos no app:** Perfil > Privacidade (exportar dados, excluir conta) e Perfil > Segurança (sessões e acessos).
- **Reclamações à ANPD:** gov.br/anpd.

*Rascunho — indicar o encarregado e publicar a identidade e o contato (LGPD, art. 41).*
TXT],
    ['slug' => 'incident', 'category' => 'seguranca', 'title' => 'Plano de Resposta a Incidentes de Segurança', 'required' => 1, 'content' => <<<'TXT'
# Plano de Resposta a Incidentes de Segurança

## 1. Classificação
Incidente = acesso, perda, alteração ou divulgação não autorizados de dados pessoais.

## 2. Passos
1. **Conter:** revogar sessões e chaves, isolar o componente afetado.
2. **Avaliar:** quais dados, quantos titulares, risco ou dano relevante.
3. **Notificar** a ANPD e os titulares em prazo razoável (referência: 3 dias úteis) quando houver risco ou dano relevante (LGPD, art. 48).
4. **Corrigir e registrar:** causa raiz, ações corretivas, lições aprendidas.

## 3. Responsáveis
Coordenação: [NOME]; Encarregado: [NOME]; Técnico: [NOME].

## 4. Evidências
A trilha de auditoria do painel (acessos à anamnese, exportações, alterações administrativas) apoia a investigação.

*Rascunho — pendente de revisão jurídica e de validação técnica.*
TXT],
    ['slug' => 'ropa', 'category' => 'lgpd', 'title' => 'Registro das Operações de Tratamento (ROPA)', 'required' => 1, 'content' => <<<'TXT'
# Registro das Operações de Tratamento (LGPD, art. 37)

| Operação | Dados | Finalidade | Base legal | Retenção | Operadores |
|---|---|---|---|---|---|
| Cadastro e conta | nome, e-mail, hash de senha, idioma | Prestar o serviço | Contrato | Conta ativa + [PRAZO] | Hospedagem |
| Anamnese | saúde (sensível) | Personalizar o treino | Consentimento | Até exclusão/revogação | Hospedagem |
| Progresso | aulas, esforço, pontos | Relatórios e gamificação | Contrato | Conta ativa | Hospedagem |
| Pagamentos | valor, data, meio, situação | Cobrança | Contrato / obrigação legal | [5 anos] | Gateways |
| Consultas online | horário, professor, notas | Atendimento | Contrato | [PRAZO] | Hospedagem, e-mail |
| Auditoria e segurança | hash de IP, dispositivo, ações | Segurança | Legítimo interesse | [PRAZO] | Hospedagem |
| E-mails transacionais | e-mail, nome | Comunicação do serviço | Contrato | [PRAZO] | Provedor SMTP |

*Rascunho — completar e validar.*
TXT],
    ['slug' => 'ripd', 'category' => 'lgpd', 'title' => 'Relatório de Impacto à Proteção de Dados (RIPD)', 'required' => 1, 'content' => <<<'TXT'
# Relatório de Impacto à Proteção de Dados (RIPD)

## 1. Descrição do tratamento
Plataforma de treinos que coleta **dados de saúde** (anamnese, PAR-Q) para personalizar fases e restrições.

## 2. Necessidade e proporcionalidade
Coleta limitada ao necessário; campos de corpo são opcionais; saúde só com consentimento específico.

## 3. Riscos identificados
- Acesso indevido a dados de saúde.
- Vazamento por credenciais comprometidas.
- Uso por professores além do necessário.
- Retenção excessiva.

## 4. Medidas de mitigação existentes
Criptografia de dados de saúde, Argon2id, sessões HttpOnly, limite de tentativas, segregação de papéis, auditoria de leitura de anamnese, exclusão e exportação pelo titular, professores sem acesso à anamnese.

## 5. Riscos residuais e plano de ação
[PREENCHER PELO ENCARREGADO/ADVOGADO]

*Rascunho — a ANPD pode solicitar este relatório.*
TXT],
    ['slug' => 'retention', 'category' => 'lgpd', 'title' => 'Política de Retenção e Descarte de Dados', 'required' => 0, 'content' => <<<'TXT'
# Política de Retenção e Descarte

- Conta e progresso: enquanto a conta estiver ativa; eliminados na exclusão.
- Pagamentos e comissões: [5 anos] (obrigações fiscais/contábeis).
- Logs de auditoria: [12 meses], sem vínculo ao titular após exclusão da conta.
- Backups: ciclo de [30 dias].
- Descarte seguro: exclusão lógica e física nos bancos; revisão semestral.

*Rascunho — definir prazos com o jurídico/contábil.*
TXT],
    ['slug' => 'minors', 'category' => 'lgpd', 'title' => 'Política para Menores de Idade', 'required' => 0, 'content' => <<<'TXT'
# Política para Menores de Idade

- O serviço é destinado a maiores de [18] anos.
- Menores de 18 só podem usar com **consentimento específico de um dos pais ou responsável legal** (LGPD, art. 14) e acompanhamento.
- Dados de saúde de menores exigem consentimento do responsável e liberação médica.
- Contas identificadas como de menor sem autorização serão suspensas e os dados eliminados.

*Rascunho — definir idade mínima e fluxo de verificação (Estatuto Digital da Criança e do Adolescente).*
TXT],
    ['slug' => 'processors', 'category' => 'lgpd', 'title' => 'Operadores e Transferência Internacional', 'required' => 0, 'content' => <<<'TXT'
# Operadores (subprocessadores) e Transferência Internacional

| Operador | Função | Dados | Localização | Salvaguarda |
|---|---|---|---|---|
| [HOSPEDAGEM] | Servidores e banco | Todos | [PAÍS] | [CONTRATO] |
| [CDN/DNS] | DNS e proteção | Metadados de acesso | [PAÍS] | [CONTRATO] |
| [PROVEDOR SMTP] | E-mails transacionais | Nome, e-mail | [PAÍS] | [CONTRATO] |
| [GATEWAYS] | Pagamentos | Valor, e-mail, dados de pagamento | [PAÍS] | [CONTRATO] |

*Rascunho — completar com os contratos (DPA) e cláusulas aplicáveis.*
TXT],
];
