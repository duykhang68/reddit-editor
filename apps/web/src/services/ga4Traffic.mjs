// Server-only GA4 adapter. Never expose OAuth access tokens or infer users from pageviews.
// GA4 reporting requires a numeric Property ID, NOT a G-* Measurement ID.
export const GA4_STREAM_ID = '16289663503';
export const GA4_MEASUREMENT_ID = 'G-Z83BHS8KMY';
export const GA4_WEBSITE = 'https://duynguyen99.blogspot.com';
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const MAX_PROPERTIES_TO_PROBE = 4;

function statusError(status, reason) {
  return Object.assign(new Error(reason), {status, reason});
}
async function googleJSON(fetcher, url, token, charge, body) {
  charge();
  let response;
  try {
    response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        ...(body ? {'Content-Type': 'application/json'} : {})
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw statusError(503, 'network');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || '').toLowerCase();
    const reason = (response.status === 401 || /insufficient authentication scopes/.test(message))
      ? 'needs_consent'
      : /has not been used|is disabled|api has not been used/.test(message)
        ? 'api_disabled'
        : response.status === 429 || /quota|rate limit|resource_exhausted/.test(message)
          ? 'rate_limited'
          : response.status === 403 ? 'no_access'
            : response.status === 404 ? 'not_found' : 'provider_error';
    throw statusError(response.status, reason);
  }
  return payload;
}
function matchesStream(stream) {
  const name = String(stream?.name || '');
  const web = stream?.webStreamData;
  const origin = String(web?.defaultUri || '').replace(/\/+$/, '');
  return name.endsWith('/dataStreams/' + GA4_STREAM_ID)
    && web?.measurementId === GA4_MEASUREMENT_ID
    && origin === GA4_WEBSITE;
}
async function verifyProperty(fetcher, propertyId, token, charge) {
  try {
    const stream = await googleJSON(
      fetcher,
      ADMIN + '/properties/' + propertyId + '/dataStreams/' + GA4_STREAM_ID,
      token, charge
    );
    return matchesStream(stream);
  } catch (error) {
    if (error.reason === 'not_found') return false;
    throw error;
  }
}
export function parseGa4Metrics(core, realtime) {
  // The aggregate core report contains unique active users over the full 7-day period.
  const get = (report, key) => {
    const index = (report?.metricHeaders || []).findIndex(item => item.name === key);
    if (index < 0) throw statusError(502, 'invalid_response');
    const raw = report?.rows?.[0]?.metricValues?.[index]?.value;
    if (!report?.rows?.length) return 0; // A valid empty report means zero activity.
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw statusError(502, 'invalid_response');
    return Math.round(value);
  };
  return {
    activeUsers7d: get(core, 'activeUsers'),
    sessions7d: get(core, 'sessions'),
    pageViews7d: get(core, 'screenPageViews'),
    activeUsers30m: get(realtime, 'activeUsers')
  };
}
async function findProperty(fetcher, token, charge) {
  const data = await googleJSON(fetcher, ADMIN + '/accountSummaries?pageSize=200', token, charge);
  const all = (data.accountSummaries || []).flatMap(account => account.propertySummaries || [])
    .filter(item => /^properties\/\d+$/.test(String(item.property || '')));
  // Favor the blog's property, but verify the exact Stream ID, Measurement ID and URL.
  all.sort((a, b) =>
    Number(/duynguyen99|blogspot/i.test(b.displayName || '')) -
    Number(/duynguyen99|blogspot/i.test(a.displayName || ''))
  );
  for (const entry of all.slice(0, MAX_PROPERTIES_TO_PROBE)) {
    const id = entry.property.split('/')[1];
    if (await verifyProperty(fetcher, id, token, charge)) return id;
  }
  return null;
}
export async function loadGa4Traffic({
  fetcher = fetch, token, propertyId = '', charge = () => {}, now = Date.now
} = {}) {
  if (!token) return {status: 'needs_consent'};
  const configured = String(propertyId || '').trim();
  if (configured && !/^\d{1,20}$/.test(configured)) {
    return {status: 'needs_property', message: 'GA4_PROPERTY_ID phải là Property ID dạng số, không phải Stream ID hoặc Measurement ID.'};
  }
  try {
    const id = configured || await findProperty(fetcher, token, charge);
    if (!id) {
      return {status: 'needs_property', message: 'Không tìm thấy web stream đã khai báo trong các property đầu tiên. Hãy cấu hình GA4_PROPERTY_ID ở backend.'};
    }
    if (configured && !(await verifyProperty(fetcher, id, token, charge))) {
      return {status: 'needs_property', message: 'GA4_PROPERTY_ID không thuộc web stream G-Z83BHS8KMY / 16289663503.'};
    }
    const streamFilter = {
      filter: {fieldName: 'streamId', stringFilter: {matchType: 'EXACT', value: GA4_STREAM_ID}}
    };
    const base = DATA + '/properties/' + id;
    const [core, realtime] = await Promise.all([
      googleJSON(fetcher, base + ':runReport', token, charge, {
        dateRanges: [{startDate: '6daysAgo', endDate: 'today'}],
        metrics: [{name: 'activeUsers'}, {name: 'sessions'}, {name: 'screenPageViews'}],
        dimensionFilter: streamFilter
      }),
      googleJSON(fetcher, base + ':runRealtimeReport', token, charge, {
        metrics: [{name: 'activeUsers'}],
        dimensionFilter: streamFilter,
        minuteRanges: [{startMinutesAgo: 29, endMinutesAgo: 0}]
      })
    ]);
    return {
      status: 'connected',
      propertyId: id,
      measurementId: GA4_MEASUREMENT_ID,
      streamId: GA4_STREAM_ID,
      website: GA4_WEBSITE,
      period: '7 ngày lịch gần nhất, bao gồm hôm nay',
      updatedAt: new Date(now()).toISOString(),
      metrics: parseGa4Metrics(core, realtime)
    };
  } catch (error) {
    const messages = {
      needs_consent: 'Google Analytics cần quyền analytics.readonly. Hãy cấp quyền lại.',
      api_disabled: 'Google Analytics Admin API hoặc Data API chưa được bật trong Google Cloud.',
      rate_limited: 'Google Analytics API đang giới hạn lượt gọi. Thử lại sau.',
      no_access: 'Tài khoản Google này chưa có quyền đọc GA4 property hoặc API bị từ chối.',
      network: 'Không kết nối được Google Analytics API.',
      invalid_response: 'Google Analytics trả dữ liệu không hợp lệ.',
      provider_error: 'Google Analytics API đang gặp lỗi.',
      not_found: 'Không tìm thấy GA4 property hoặc stream phù hợp.'
    };
    const reason = Object.hasOwn(messages, error.reason) ? error.reason : 'provider_error';
    return {status: reason === 'needs_consent' ? 'needs_consent' : 'unavailable',
      reason, message: messages[reason]};
  }
}
