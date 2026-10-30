import { prisma } from '../src/prisma.js';
try {
  const username = process.env.AUTHOR_USERNAME?.trim().toLowerCase();
  const author =
    username && (await prisma.user.findUnique({ where: { username } }));
  if (!author || author.role !== 'AUTHOR')
    throw new Error('Provision your author first and set AUTHOR_USERNAME');
  const samples = [
    {
      id: 'c3295193-442e-4bf1-a087-b965f7e86dd1',
      title: 'The quiet work of paying attention',
      excerpt: 'A fictional field note on noticing what is already here.',
      body: 'The notebook stayed closed for most of the walk. That was the first useful thing.\n\nAt the corner, someone was repairing a blue gate. The sound of the brush against metal carried further than expected. Small details ask for very little: a pause, a second look, a sentence.\n\nWriting can begin there. Not with a grand idea, but with something ordinary that deserves a little room.',
    },
    {
      id: 'c3295193-442e-4bf1-a087-b965f7e86dd2',
      title: 'Leaving room in the margins',
      excerpt: 'A fictional reflection on making space for unfinished ideas.',
      body: 'A page filled edge to edge leaves nowhere for a new thought to land.\n\nI have been trying to leave more space. In a notebook, in an afternoon, in the first version of a piece. The blank is not a mistake. It is an invitation to return.\n\nSome ideas need time before they become clear enough to share.',
    },
  ];
  for (const sample of samples)
    await prisma.post.upsert({
      where: { id: sample.id },
      update: {},
      create: {
        ...sample,
        authorId: author.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  await prisma.comment.upsert({
    where: { id: 'c3295193-442e-4bf1-a087-b965f7e86dd3' },
    update: {},
    create: {
      id: 'c3295193-442e-4bf1-a087-b965f7e86dd3',
      postId: samples[0].id,
      displayName: 'Sample reader',
      body: 'A useful reminder to slow down. (Fictional sample comment.)',
    },
  });
  console.log('Fictional sample content added; existing records unchanged.');
} finally {
  await prisma.$disconnect();
}
