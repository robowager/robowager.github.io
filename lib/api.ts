import fs from 'fs';
import { join } from 'path'
import matter from 'gray-matter'
import { remark } from 'remark'
import html from 'remark-html'

import type PostType from '../interfaces/post'

const postsDirectory = join(process.cwd(), '_posts')

function getPostSlugs() {
  return fs.readdirSync(postsDirectory)
}

/**
 * @param {Date} date
 * @return {String} date str in format YYYY-MM-DD
 */
function getFriendlyDate(date: Date) {
  return date.toISOString().substring(0, 10);
}

/**
 * @param {String} filename
 * @return {String} slug, which is an identifier for a post
 */
function getSlugFromFilename(filename: string) {
  return filename.replace(/\.md$/, '');
}

/**
 * Implements inverse of getSlugFromFilename.
 * @param {String} slug - id for a post
 * @return {String} post filename
 */
function getFilenameFromSlug(slug: string) {
  return `${slug}.md`;
}

function getFilepathFromSlug(slug: string) {
  return join(postsDirectory, getFilenameFromSlug(slug));
}

/**
 * @param {String} markdown - content read from post file
 * @return {String} content in html obtained using remark
 */
export async function markdownToHtml(markdown: string) {
  const result = await remark().use(html).process(markdown)
  return result.toString()
}

/**
 * @param {String} slug - post id
 * @return {PostType} output of matter on post file, along
 *   with some extra fields
 */
export async function getPostFromSlug(slug: string): Promise<PostType> {
  const fileContents = fs.readFileSync(getFilepathFromSlug(slug), 'utf8');
  const { data, content } = matter(fileContents);
  return {
    title: data.title,
    date: data.date,
    slug: slug,
    friendlyDate: getFriendlyDate(data.date),
    content: content,
    contentHtml: (await markdownToHtml(content)),
  };
}

async function getPostFromFilename(filename: string) {
  return await getPostFromSlug(getSlugFromFilename(filename));
}

/**
 * @return {PostType[]} a list of objects representing all posts
 */
export async function getAllPosts() {
  const filenames = fs.readdirSync(postsDirectory);
  let posts = [];
  for (const filename of filenames) {
    const post = await getPostFromFilename(filename);
    posts.push(post);
  }
  // sort posts by date in descending order
  return posts.sort((post1, post2) => (post1.date > post2.date ? -1 : 1))
}

/**
 * @return {[String]} list of all post slugs (ids)
 */
export function getAllSlugs() {
  const filenames = fs.readdirSync(postsDirectory);
  return filenames.map((filename) => getSlugFromFilename(filename));
}

