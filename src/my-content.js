// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. See LICENSE: https://github.com/anhtuank9.
'use strict';

const COURSES_URL = 'https://englishconnect.pearson.com/courses/list/type/all';
const COURSE_SELECTOR = 'a.card-link[href^="/courses/"][href*="/next/"]';
const LESSON_SELECTOR = '.resource-card__title-wrapper a, span.mdl-card__title-text.card-link';

async function listCourses(page) {
  await page.goto(COURSES_URL, { waitUntil: 'domcontentloaded' });
  const cards = page.locator(COURSE_SELECTOR);
  await cards.first().waitFor({ state: 'visible', timeout: 120_000 });
  return cards.evaluateAll(elements => elements.map(element => {
    const title = (element.innerText || element.getAttribute('aria-label') || '').trim();
    const href = element.getAttribute('href') || '';
    return { title, href };
  }).filter(entry => entry.title && /^\/courses\/\d+\/next\//.test(entry.href)));
}

async function listLessons(page, course) {
  await page.goto(new URL(course.href, COURSES_URL).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('button').filter({ hasText: 'TABLE OF CONTENTS' }).first()
    .waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator('button').filter({ hasText: 'expand_more' }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 30; i++) {
    const collapsed = page.locator('button').filter({ hasText: 'expand_more' });
    const count = await collapsed.count();
    if (!count) break;
    await collapsed.first().click();
    await page.waitForFunction(previous => [...document.querySelectorAll('button')]
      .filter(button => button.innerText.includes('expand_more')).length < previous,
    count, { timeout: 10_000 }).catch(() => {});
    if (await collapsed.count() >= count) break;
  }
  await page.locator(LESSON_SELECTOR).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  return page.locator(LESSON_SELECTOR).evaluateAll(elements => [...new Set(elements
    .filter(element => element.getBoundingClientRect().width > 0)
    .map(element => (element.querySelector('[aria-hidden="true"]')?.textContent ||
      element.innerText || element.getAttribute('aria-label') || '').trim())
    .filter(Boolean))]);
}

async function runMyContent(page, config) {
  const courses = await listCourses(page);
  console.log(`My Content courses (${courses.length}):`);
  for (const course of courses) console.log(`- ${course.title}`);
  const selected = config.courseFilter
    ? courses.filter(course => course.title.toLocaleLowerCase().includes(config.courseFilter))
    : [];
  if (!config.courseFilter) {
    console.log('Set PEARSON_COURSE_FILTER to preview lessons in a specific course. Preview never opens or checks a lesson.');
  } else if (!selected.length) {
    console.log(`No My Content course matches PEARSON_COURSE_FILTER=${config.courseFilter}.`);
  }
  let lessonCount = 0;
  for (const course of selected.slice(0, config.maxAssignments)) {
    const lessons = await listLessons(page, course);
    const matching = lessons.filter(title => !config.lessonFilter || title.toLocaleLowerCase().includes(config.lessonFilter));
    console.log(`${course.title} (${matching.length} lessons):`);
    for (const title of matching) console.log(`  - ${title}`);
    lessonCount += matching.length;
  }
  return { courses: courses.length, lessons: lessonCount };
}

module.exports = { listCourses, listLessons, runMyContent };
