export type ApiErrorDetail = {
  type?: string;
  loc?: Array<string | number>;
  msg?: string;
  input?: unknown;
};

export type ApiErrorBody = {
  status?: string;
  message?: string;
  detail?: ApiErrorDetail[] | string;
};

export type ApiFieldErrors = Record<string, string>;

export class ApiResponseError extends Error {
  status: number;
  body: ApiErrorBody | null;
  fieldErrors: ApiFieldErrors;

  constructor(
    status: number,
    message: string,
    body: ApiErrorBody | null = null,
    fieldErrors: ApiFieldErrors = {}
  ) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.body = body;
    this.fieldErrors = fieldErrors;
  }
}

function formatDetail(detail: ApiErrorBody["detail"]) {
  if (!detail) return null;

  if (typeof detail === "string") {
    return detail;
  }

  const messages = detail
    .map((item) => item.msg)
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join("\n") : null;
}

function getFieldName(loc: ApiErrorDetail["loc"]) {
  if (!Array.isArray(loc) || loc.length === 0) return null;

  const field = loc[loc.length - 1];

  return typeof field === "string" ? field : String(field);
}

function mapFieldErrors(detail: ApiErrorBody["detail"]): ApiFieldErrors {
  if (!Array.isArray(detail)) return {};

  return detail.reduce<ApiFieldErrors>((errors, item) => {
    const field = getFieldName(item.loc);

    if (!field || !item.msg || errors[field]) {
      return errors;
    }

    return {
      ...errors,
      [field]: item.msg,
    };
  }, {});
}

function getDefaultMessage(status: number) {
  switch (status) {
    case 400:
      return "요청을 처리할 수 없습니다.";
    case 401:
      return "인증 정보가 유효하지 않습니다.";
    case 403:
      return "권한이 없습니다.";
    case 404:
      return "요청한 정보를 찾을 수 없습니다.";
    case 409:
      return "이미 처리되었거나 충돌이 발생했습니다.";
    case 422:
      return "입력값을 확인해주세요.";
    case 429:
      return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case 500:
      return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    default:
      return null;
  }
}

export async function parseApiError(response: Response, fallbackMessage: string) {
  const text = await response.text();
  let body: ApiErrorBody | null = null;

  if (text) {
    try {
      body = JSON.parse(text) as ApiErrorBody;
    } catch {
      return new ApiResponseError(response.status, text, null);
    }
  }

  const detailMessage = formatDetail(body?.detail);
  const fieldErrors = mapFieldErrors(body?.detail);
  const message =
    (response.status === 422 && detailMessage) ||
    (body?.status === "error" && body.message) ||
    body?.message ||
    getDefaultMessage(response.status) ||
    fallbackMessage;

  return new ApiResponseError(response.status, message, body, fieldErrors);
}
