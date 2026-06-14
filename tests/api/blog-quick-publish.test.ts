import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBlogPublishToken } from '../../api/_lib/blogPublishToken.js';

const POST_ID = '22222222-2222-2222-2222-222222222222';
const SECRET = 'test-blog-publish-secret';

const blogPostsSelectEq = vi.fn();
const blogPostsUpdateEq = vi.fn();

const from = vi.fn((table: string) => {
  if (table === 'blog_posts') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: blogPostsSelectEq,
        })),
      })),
      update: vi.fn(() => ({
        eq: blogPostsUpdateEq,
      })),
    };
  }
  return {};
});

const createClient = vi.fn(() => ({ from }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', fetchMock);

function mockRes() {
  const out = { statusCode: 0, body: '' as string, headers: {} as Record<string, string> };
  const res: any = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    send(body: string) {
      out.body = body;
      return res;
    },
    setHeader(key: string, value: string) {
      out.headers[key.toLowerCase()] = value;
      return res;
    },
    getResult: () => out,
  };
  return res;
}

function mockReq(query: Record<string, string>, method = 'GET') {
  return { method, query, headers: {} };
}

const prevSecret = process.env.BLOG_PUBLISH_SECRET;
const prevSupabaseUrl = process.env.SUPABASE_URL;
const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const prevAppUrl = process.env.APP_URL;

describe('GET /api/blog-quick-publish', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.BLOG_PUBLISH_SECRET = SECRET;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
    process.env.APP_URL = 'https://www.tutlio.lt';
    blogPostsUpdateEq.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BLOG_PUBLISH_SECRET;
    else process.env.BLOG_PUBLISH_SECRET = prevSecret;
    if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevSupabaseUrl;
    if (prevServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
  });

  it('rejects invalid or missing tokens', async () => {
    const handler = (await import('../../api/blog-quick-publish.js')).default;
    const res = mockRes();
    await handler(mockReq({ id: POST_ID, t: 'bad-token' }), res);
    expect(res.getResult().statusCode).toBe(400);
    expect(res.getResult().body).toContain('Invalid');
  });

  it('rejects non-GET methods', async () => {
    const handler = (await import('../../api/blog-quick-publish.js')).default;
    const res = mockRes();
    await handler(mockReq({ id: POST_ID, t: buildBlogPublishToken(POST_ID) }, 'POST'), res);
    expect(res.getResult().statusCode).toBe(405);
  });

  it('publishes a draft auto post and returns success HTML', async () => {
    blogPostsSelectEq
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'draft',
          source: 'auto',
          slug_lt: 'test-slug',
          slug: 'test-slug',
          title_lt: 'Pavadinimas',
          title_en: 'Title',
          title_pl: 'Tytul',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'draft',
          source: 'auto',
          slug_lt: 'test-slug',
          slug: 'test-slug',
        },
        error: null,
      });

    const handler = (await import('../../api/blog-quick-publish.js')).default;
    const res = mockRes();
    await handler(mockReq({ id: POST_ID, t: buildBlogPublishToken(POST_ID) }), res);

    const out = res.getResult();
    expect(out.statusCode).toBe(200);
    expect(out.headers['content-type']).toContain('text/html');
    expect(out.body).toContain('Straipsnis publikuotas');
    expect(out.body).toContain('https://www.tutlio.lt/blog/test-slug');
    expect(blogPostsUpdateEq).toHaveBeenCalled();
  });

  it('accepts already-published posts without failing', async () => {
    blogPostsSelectEq
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'published',
          source: 'auto',
          slug_lt: 'live-slug',
          slug: 'live-slug',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'published',
          source: 'auto',
          slug_lt: 'live-slug',
          slug: 'live-slug',
        },
        error: null,
      });

    const handler = (await import('../../api/blog-quick-publish.js')).default;
    const res = mockRes();
    await handler(mockReq({ id: POST_ID, t: buildBlogPublishToken(POST_ID) }), res);

    expect(res.getResult().statusCode).toBe(200);
    expect(blogPostsUpdateEq).not.toHaveBeenCalled();
  });

  it('rejects manual posts that are not auto-generated', async () => {
    blogPostsSelectEq
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'draft',
          source: 'manual',
          slug_lt: 'manual-slug',
          slug: 'manual-slug',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: POST_ID,
          status: 'draft',
          source: 'manual',
          slug_lt: 'manual-slug',
          slug: 'manual-slug',
        },
        error: null,
      });

    const handler = (await import('../../api/blog-quick-publish.js')).default;
    const res = mockRes();
    await handler(mockReq({ id: POST_ID, t: buildBlogPublishToken(POST_ID) }), res);

    expect(res.getResult().statusCode).toBe(400);
    expect(res.getResult().body).toContain('auto-generated');
  });
});
