import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildBlogPublishToken,
  verifyBlogPublishToken,
  blogQuickPublishUrl,
} from '../../api/_lib/blogPublishToken.js';

const POST_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-blog-publish-secret';

const prevSecret = process.env.BLOG_PUBLISH_SECRET;

beforeEach(() => {
  process.env.BLOG_PUBLISH_SECRET = SECRET;
});

afterEach(() => {
  if (prevSecret === undefined) delete process.env.BLOG_PUBLISH_SECRET;
  else process.env.BLOG_PUBLISH_SECRET = prevSecret;
});

describe('blogPublishToken', () => {
  it('builds and verifies a token', () => {
    const token = buildBlogPublishToken(POST_ID);
    expect(verifyBlogPublishToken(token, POST_ID)).toBe(true);
    expect(verifyBlogPublishToken(token, 'other-id')).toBe(false);
    expect(verifyBlogPublishToken('wrong', POST_ID)).toBe(false);
  });

  it('builds quick publish URL', () => {
    const url = blogQuickPublishUrl(POST_ID, 'https://www.tutlio.lt');
    expect(url).toContain('/api/blog-quick-publish');
    expect(url).toContain(encodeURIComponent(POST_ID));
    expect(url).toContain('t=');
  });
});
