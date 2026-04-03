export type ApiErrorBody =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    }
  | null
  | undefined;

const fieldLabels: Record<string, string> = {
  action: "acao",
  active: "status ativo",
  address: "endereco",
  amount: "valor",
  bannerUrl: "URL do banner",
  brand: "marca",
  cashSessionId: "sessao de caixa",
  cashTerminalId: "terminal de caixa",
  categoryId: "categoria",
  city: "cidade",
  closingAmount: "valor de fechamento",
  cnpj: "CNPJ",
  countedQuantity: "saldo contado",
  contactName: "contato",
  costPrice: "preco de custo",
  cpfCnpj: "CPF/CNPJ",
  customerId: "cliente",
  defaultSerialized: "serializacao padrao",
  description: "descricao",
  discountAmount: "desconto",
  displayName: "nome exibido",
  dueDate: "vencimento",
  email: "e-mail",
  end: "data final",
  endDate: "data final",
  entity: "entidade",
  fromLocationId: "local de origem",
  hasSerialControl: "controle serial",
  heroBannerEnabled: "banner principal",
  installments: "parcelas",
  isService: "servico",
  limit: "limite",
  locationId: "local de estoque",
  logoUrl: "URL da logo",
  lowStockOnly: "somente estoque baixo",
  model: "modelo",
  movementType: "tipo de movimentacao",
  mustChangePassword: "troca obrigatoria de senha",
  name: "nome",
  needsPriceReview: "revisao de preco",
  newPassword: "nova senha",
  notes: "observacoes",
  openingAmount: "valor de abertura",
  password: "senha",
  paymentMethod: "forma de pagamento",
  phone: "telefone",
  phone2: "telefone 2",
  prefix: "prefixo",
  primaryColor: "cor primaria",
  productId: "produto",
  quantity: "quantidade",
  reason: "motivo do ajuste",
  referenceCode: "codigo de referencia",
  roleId: "papel",
  salePrice: "preco de venda",
  search: "busca",
  secondaryColor: "cor secundaria",
  sequenceName: "sequence_name",
  start: "data inicial",
  startDate: "data inicial",
  state: "UF",
  stateRegistration: "inscricao estadual",
  status: "status",
  stockMin: "estoque minimo",
  storeId: "loja",
  supplierCode: "codigo do fornecedor",
  supplierId: "fornecedor",
  take: "limite",
  term: "busca",
  toLocationId: "local de destino",
  tradeName: "nome fantasia",
  unitPrice: "preco unitario",
  userId: "usuario",
  zipCode: "CEP"
};

export class ApiHttpError extends Error {
  status?: number;
  body?: ApiErrorBody;
  path?: string;
  isNetworkError: boolean;
  handledGlobally = false;

  constructor({
    message,
    status,
    body,
    path,
    isNetworkError = false
  }: {
    message: string;
    status?: number;
    body?: ApiErrorBody;
    path?: string;
    isNetworkError?: boolean;
  }) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.body = body;
    this.path = path;
    this.isNetworkError = isNetworkError;
  }
}

function toSentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizeFieldName(fieldName: string) {
  const mapped = fieldLabels[fieldName];
  if (mapped) {
    return toSentenceCase(mapped);
  }

  return toSentenceCase(
    fieldName
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .toLowerCase()
  );
}

function stripTechnicalNoise(message: string) {
  return message
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part && !/^\s*at\s+/i.test(part))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function translateApiErrorText(message: string) {
  const normalizedMessage = stripTechnicalNoise(message);

  if (!normalizedMessage) {
    return "Nao foi possivel concluir a requisicao.";
  }

  if (/^Failed to fetch$/i.test(normalizedMessage)) {
    return "Sem conexao com o servidor.";
  }

  if (/^NetworkError/i.test(normalizedMessage) || /^Load failed$/i.test(normalizedMessage)) {
    return "Sem conexao com o servidor.";
  }

  const stringMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be a string$/i);
  if (stringMatch) {
    return `${humanizeFieldName(stringMatch[1])} deve ser um texto.`;
  }

  const emailMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be an email$/i);
  if (emailMatch) {
    return `${humanizeFieldName(emailMatch[1])} deve ser um e-mail valido.`;
  }

  const maxLengthMatch = normalizedMessage.match(
    /^([A-Za-z0-9_]+) must be shorter than or equal to (\d+) characters$/i
  );
  if (maxLengthMatch) {
    return `${humanizeFieldName(maxLengthMatch[1])} deve ter no maximo ${maxLengthMatch[2]} caracteres.`;
  }

  const minLengthMatch = normalizedMessage.match(
    /^([A-Za-z0-9_]+) must be longer than or equal to (\d+) characters$/i
  );
  if (minLengthMatch) {
    return `${humanizeFieldName(minLengthMatch[1])} deve ter no minimo ${minLengthMatch[2]} caracteres.`;
  }

  const emptyMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) should not be empty$/i);
  if (emptyMatch) {
    return `${humanizeFieldName(emptyMatch[1])} e obrigatorio.`;
  }

  const uuidMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be a UUID$/i);
  if (uuidMatch) {
    return `${humanizeFieldName(uuidMatch[1])} deve ser um identificador valido.`;
  }

  const numberMatch = normalizedMessage.match(
    /^([A-Za-z0-9_]+) must be a number conforming to the specified constraints$/i
  );
  if (numberMatch) {
    return `${humanizeFieldName(numberMatch[1])} deve ser um numero valido.`;
  }

  const intMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be an integer number$/i);
  if (intMatch) {
    return `${humanizeFieldName(intMatch[1])} deve ser um numero inteiro.`;
  }

  const minValueMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must not be less than (\d+)$/i);
  if (minValueMatch) {
    return `${humanizeFieldName(minValueMatch[1])} deve ser maior ou igual a ${minValueMatch[2]}.`;
  }

  const boolMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be a boolean value$/i);
  if (boolMatch) {
    return `${humanizeFieldName(boolMatch[1])} deve ser verdadeiro ou falso.`;
  }

  const urlMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be a URL address$/i);
  if (urlMatch) {
    return `${humanizeFieldName(urlMatch[1])} deve ser uma URL valida.`;
  }

  const hexColorMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be a hexadecimal color$/i);
  if (hexColorMatch) {
    return `${humanizeFieldName(hexColorMatch[1])} deve ser uma cor hexadecimal valida.`;
  }

  const dateMatch = normalizedMessage.match(
    /^([A-Za-z0-9_]+) must be a valid ISO 8601 date string$/i
  );
  if (dateMatch) {
    return `${humanizeFieldName(dateMatch[1])} deve ser uma data valida.`;
  }

  const enumMatch = normalizedMessage.match(
    /^([A-Za-z0-9_]+) must be one of the following values: (.+)$/i
  );
  if (enumMatch) {
    return `${humanizeFieldName(enumMatch[1])} deve ser um dos seguintes valores: ${enumMatch[2]}.`;
  }

  const arrayMatch = normalizedMessage.match(/^([A-Za-z0-9_]+) must be an array$/i);
  if (arrayMatch) {
    return `${humanizeFieldName(arrayMatch[1])} deve ser uma lista valida.`;
  }

  return normalizedMessage
    .replace(/\bBad Request\b/gi, "Requisicao invalida")
    .replace(/\bUnauthorized\b/gi, "Nao autorizado")
    .replace(/\bForbidden\b/gi, "Acesso negado")
    .replace(/\bNot Found\b/gi, "Nao encontrado")
    .replace(/\bConflict\b/gi, "Conflito")
    .replace(/\bInternal Server Error\b/gi, "Erro interno do servidor");
}

function listValidationMessages(messages: string[]) {
  return messages
    .map((message) => translateApiErrorText(message))
    .filter((message) => message.trim().length > 0)
    .join(" ");
}

function extractApiMessage(body: ApiErrorBody) {
  if (typeof body === "string") {
    return translateApiErrorText(body);
  }

  if (body && typeof body === "object" && typeof body.message === "string") {
    return translateApiErrorText(body.message);
  }

  if (body && typeof body === "object" && Array.isArray(body.message)) {
    return listValidationMessages(
      body.message.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    );
  }

  if (body && typeof body === "object" && typeof body.error === "string") {
    return translateApiErrorText(body.error);
  }

  return null;
}

export function createApiHttpError({
  status,
  body,
  path,
  isNetworkError = false
}: {
  status?: number;
  body?: ApiErrorBody;
  path?: string;
  isNetworkError?: boolean;
}) {
  const extractedMessage = extractApiMessage(body);
  const message =
    extractedMessage ??
    (isNetworkError
      ? "Sem conexao com o servidor"
      : status
        ? fallbackStatusMessage(status)
        : "Nao foi possivel concluir a requisicao.");

  return new ApiHttpError({
    message,
    status,
    body,
    path,
    isNetworkError
  });
}

function fallbackStatusMessage(status: number) {
  switch (status) {
    case 400:
      return "Dados invalidos";
    case 401:
      return "Sessao expirada, faca login novamente";
    case 403:
      return "Voce nao tem permissao para esta acao";
    case 404:
      return "Registro nao encontrado";
    case 409:
      return "Conflito de dados";
    case 422:
      return "Revise os dados informados.";
    default:
      return "Erro interno do servidor. Tente novamente.";
  }
}

export function isApiHttpError(error: unknown): error is ApiHttpError {
  return error instanceof ApiHttpError;
}

export function isGloballyHandledApiError(error: unknown) {
  return isApiHttpError(error) && error.handledGlobally;
}

export function markApiErrorAsHandled(error: unknown) {
  if (isApiHttpError(error)) {
    error.handledGlobally = true;
  }
}

export function parseApiError(error: unknown): string {
  if (isApiHttpError(error)) {
    if (error.isNetworkError) {
      return "Sem conexao com o servidor";
    }

    if (error.status === 400) {
      return extractApiMessage(error.body) ?? "Dados invalidos";
    }

    if (error.status === 401) {
      return "Sessao expirada, faca login novamente";
    }

    if (error.status === 403) {
      return "Voce nao tem permissao para esta acao";
    }

    if (error.status === 404) {
      return "Registro nao encontrado";
    }

    if (error.status === 409) {
      return extractApiMessage(error.body) ?? "Conflito de dados";
    }

    if (error.status === 422) {
      return extractApiMessage(error.body) ?? "Revise os dados informados.";
    }

    if ((error.status ?? 0) >= 500) {
      return "Erro interno do servidor. Tente novamente.";
    }

    return extractApiMessage(error.body) ?? error.message;
  }

  if (error instanceof Error) {
    return translateApiErrorText(error.message);
  }

  return "Nao foi possivel concluir a requisicao.";
}
