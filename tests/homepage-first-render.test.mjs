import test from 'node:test';
import assert from 'node:assert/strict';
test('homepage HTTP response contains the designed hero and crawlable category cards',async()=>{
  const r=await fetch('http://localhost:4314/');assert.equal(r.status,200);
  const html=await r.text();
  assert.doesNotMatch(html,/class="seo-home"/);
  assert.match(html,/class="hero"/);
  assert.match(html,/class="home-category-card"/);
  assert.match(html,/href="\/category\/sparklers"/);
  assert.match(html,/href="https:\/\/crackersmela.com\/product\//);
  assert.match(html,/rel="canonical"[^>]+https:\/\/crackersmela.com\//);
  assert.match(html,/application\/ld\+json/);
  assert.ok(html.indexOf('css/styles.css')<html.indexOf('class="hero"'));
});
