import { getAllSlugs, getPostFromSlug } from '@/lib/api'

// see
// https://nextjs.org/docs/app/building-your-application/optimizing/metadata
export async function generateMetadata(
  { params : { slug } }:
  { params : { slug: string } }
  ) {
  const post = await getPostFromSlug(slug);
  return {
    title: post.title,
  }
}

export default async function Page(
  { params : { slug } }:
  { params : { slug: string } }
  ) {
  // post is an object which is obtained by reading a file's
  // contents with matter, along with some additional helper fields
  const post = await getPostFromSlug(slug);

  // see
  // https://stackoverflow.com/questions/37337289/react-js-set-innerhtml-vs-dangerouslysetinnerhtml
  return (
    <>
      <article className="post">
        <h1>{post.title}</h1>
        <p>{post.friendlyDate}</p>
        <div
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
    </>
  )
}

// see
// https://nextjs.org/docs/app/api-reference/functions/generate-static-params
export function generateStaticParams() {
  // Function getAllSlugs returns a list of slugs, which are string ids of posts.
  // Replace each string with an object with the keyword `slug`.
  // The Post function will then be called with each object.
  return getAllSlugs()
    .map(slug => ({slug: slug}));
}
