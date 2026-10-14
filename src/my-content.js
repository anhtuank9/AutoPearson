// AutoPearson — Copyright (c) 2026 anhtuank9. All rights reserved.
// Non-commercial use only. See LICENSE: https://github.com/anhtuank9.
'use strict';

const COURSES_URL = 'https://englishconnect.pearson.com/courses/list/type/all';
const GRID_COURSE_SELECTOR = 'a.card-link[href^="/courses/"][href*="/next/"]';
const LIST_COURSE_SELECTOR = '.list-course-card[aria-label]';
const LESSON_SELECTOR = '.resource-card__title-wrapper a, span.mdl-card__title-text.card-link';
const { runLesson, saveDiagnostic } = require('./assignment');
const { playerScope, saveAndExit } = require('./player');

async function listCourses(page) {
  await page.goto(COURSES_URL, { waitUntil: 'domcontentloaded' });
  const cards = page.locator(`${GRID_COURSE_SELECTOR}, ${LIST_COURSE_SELECTOR}`);
  await cards.first().waitFor({ state: 'visible', timeout: 120_000 });
  return cards.evaluateAll(elements => elements.map(element => {
    const title = (element.getAttribute('aria-label') || element.innerText || '').trim();
    const href = element.getAttribute('href') || '';
    return { title, href };
  }).filter(entry => entry.title && (!entry.href || /^\/courses\/\d+\/next\//.test(entry.href))));
}

async function listLessons(page, course) {
  if (course.href) {
    await page.goto(new URL(course.href, COURSES_URL).toString(), { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(COURSES_URL, { waitUntil: 'domcontentloaded' });
    const card = page.locator(LIST_COURSE_SELECTOR).filter({ hasText: course.title }).first();
    await card.waitFor({ state: 'visible', timeout: 120_000 });
    await card.locator('span.mdl-card__title-text.card-link').click();
    await page.waitForURL(url => /^\/courses\/\d+\/next\//.test(url.pathname), { timeout: 30_000 });
  }
  await page.locator('button').filter({ hasText: 'TABLE OF CONTENTS' }).first()
    .waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator('button').filter({ hasText: 'expand_more' }).first()
    .waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
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
  const selected = config.courseFilter === '*'
    ? courses
    : config.courseFilter
      ? courses.filter(course => course.title.toLocaleLowerCase().includes(config.courseFilter))
      : [];
  if (!config.courseFilter) {
    console.log('Set PEARSON_COURSE_FILTER to a course name or * for all courses. Preview never opens or checks a lesson.');
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

async function openLesson(page, course, title) {
  const lesson = () => page.locator(LESSON_SELECTOR).filter({ hasText: title }).first();
  if (!await lesson().isVisible().catch(() => false)) await listLessons(page, course);
  await lesson().click();
  await page.waitForURL(url => /^\/lesson\/view\/\d+\//.test(url.pathname), { timeout: 30_000 });
  await page.locator('#content-iframe').waitFor({ state: 'attached', timeout: 30_000 });
  for (let loadAttempt = 0; loadAttempt < 2; loadAttempt++) {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (page.frames().some(frame => /pearsonspeakout\.speechace\.co/.test(frame.url()))) {
        throw new Error('Interactive Speaking Practice uses an external microphone activity without Check');
      }
      const scope = await playerScope(page);
      const text = await scope.locator('body').innerText().catch(() => '');
      if (/Overview|Lesson Page|Reference|Result\s*\|/i.test(text) && text.length > 40) return text;
      await page.waitForTimeout(500);
    }
    if (loadAttempt === 0) {
      console.log(`Lesson player stayed empty; reloading ${title} once.`);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  throw new Error(`Lesson player did not load: ${title}`);
}

async function runMyContentSolve(page, config) {
  if (!config.courseFilter) throw new Error('Set PEARSON_COURSE_FILTER to a course name or * before solving My Content');
  const allCourses = await listCourses(page);
  const courses = config.courseFilter === '*'
    ? allCourses : allCourses.filter(course => course.title.toLocaleLowerCase().includes(config.courseFilter));
  if (!courses.length) throw new Error(`No My Content course matches PEARSON_COURSE_FILTER=${config.courseFilter}`);
  let visited = 0;
  let seen = 0;
  let completed = 0;
  let alreadyComplete = 0;
  const failures = [];
  for (const course of courses) {
    const lessons = (await listLessons(page, course))
      .filter(title => !config.lessonFilter || title.toLocaleLowerCase().includes(config.lessonFilter));
    console.log(`My Content ${course.title}: ${lessons.length} lesson(s).`);
    for (const title of lessons) {
      seen++;
      if (seen < config.myContentStartAt) continue;
      if (visited >= config.maxMyContentLessons) {
        console.log(`Stopped at PEARSON_MAX_MY_CONTENT_LESSONS=${config.maxMyContentLessons}.`);
        return { courses: courses.length, visited, completed, alreadyComplete, failures };
      }
      visited++;
      console.log(`My Content lesson ${seen}: ${course.title} / ${title}`);
      try {
        const overview = await openLesson(page, course, title);
        if (/\b(?:Overview|Reference)\s*100%/i.test(overview)) {
          alreadyComplete++;
          console.log(`Already complete: ${title}`);
          await saveAndExit(page);
          continue;
        }
        let reportScore = NaN;
        await runLesson(page, config, report => { reportScore = report.score; });
        if (Number.isFinite(reportScore) && reportScore < 100) {
          failures.push({ course: course.title, lesson: title, reason: `Lesson report ${reportScore}%` });
          console.error(`Saved below 100%: ${title} (${reportScore}%).`);
        } else {
          completed++;
          console.log(`Saved: ${title}${Number.isFinite(reportScore) ? ` (${reportScore}%)` : ''}`);
        }
      } catch (error) {
        console.error(`Could not complete ${course.title} / ${title}: ${error.message}`);
        failures.push({ course: course.title, lesson: title, reason: error.message });
        if (!page.isClosed() && page.url().includes('/lesson/view/')) {
          await saveDiagnostic(page, config, error.message).catch(() => {});
          await saveAndExit(page).catch(saveError =>
            console.error(`Could not Save & Exit ${title}: ${saveError.message}`));
        }
      }
    }
  }
  return { courses: courses.length, visited, completed, alreadyComplete, failures };
}

module.exports = { listCourses, listLessons, runMyContent, runMyContentSolve };
