import Link from 'next/link'
import { getAllPosts } from '@/lib/api'

export default async function Page() {
  const posts = await getAllPosts();

  return (
    <div>
      <h1>robowager&apos;s blog</h1>
      <p>Notes of an armchair roboticist</p>
      <ul>
        {
          posts.map(post => {
            return (
              <li key={post.slug}>
                <Link href={`posts/${post.slug}`}>
                  {post.friendlyDate}: {post.title}
                </Link>
              </li>
            )
          })
        }
      </ul>
    </div>
  )
}
