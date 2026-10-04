/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const { PrismaClient, Role, TransactionStatus } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@ciitm.edu";
  const adminPasswordHash = await bcrypt.hash("Admin@12345", 12);

  await prisma.profile.upsert({
    where: { email: adminEmail },
    update: {
      name: "CIITM Library Admin",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      name: "CIITM Library Admin",
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const studentNames = [
    "Aisha Khan",
    "Rahul Sharma",
    "Nora Ahmed",
    "Ibrahim Ali",
    "Meera Patel",
    "Daniel Okafor",
  ];

  for (const [index, name] of studentNames.entries()) {
    const email = `student${index + 1}@ciitm.edu`;
    await prisma.profile.upsert({
      where: { email },
      update: { name, isActive: true },
      create: {
        name,
        email,
        passwordHash: await bcrypt.hash(`Student@${index + 1}123`, 12),
        role: Role.USER,
        isActive: true,
      },
    });
  }

  const sampleBooks = [
    {
      title: "Object-Oriented Programming with Java",
      author: "James B. Smith",
      isbn: "978-1-234567-01-2",
      category: "Computer Science",
      publisher: "CIITM Press",
      publishedYear: 2023,
      totalCopies: 5,
    },
    {
      title: "Database Design and SQL",
      author: "Priya Nair",
      isbn: "978-1-234567-02-9",
      category: "Database",
      publisher: "Academic Books",
      publishedYear: 2022,
      totalCopies: 4,
    },
    {
      title: "Digital Marketing Essentials",
      author: "Benjamin Cole",
      isbn: "978-1-234567-03-6",
      category: "Business",
      publisher: "Global Learning",
      publishedYear: 2024,
      totalCopies: 3,
    },
    {
      title: "The Art of Responsive Design",
      author: "Lina Hassan",
      isbn: "978-1-234567-04-3",
      category: "UI/UX",
      publisher: "Design House",
      publishedYear: 2021,
      totalCopies: 5,
    },
    {
      title: "Modern AI Fundamentals",
      author: "Daniel Brooks",
      isbn: "978-1-234567-05-0",
      category: "Artificial Intelligence",
      publisher: "Future Labs",
      publishedYear: 2024,
      totalCopies: 6,
    },
    {
      title: "Business Ethics and Leadership",
      author: "Farah Ali",
      isbn: "978-1-234567-06-7",
      category: "Management",
      publisher: "Insight Books",
      publishedYear: 2020,
      totalCopies: 2,
    },
  ];

  for (const book of sampleBooks) {
    await prisma.book.upsert({
      where: { isbn: book.isbn },
      update: {
        title: book.title,
        author: book.author,
        category: book.category,
        publisher: book.publisher,
        publishedYear: book.publishedYear,
        totalCopies: book.totalCopies,
        availableCopies: book.totalCopies,
      },
      create: {
        ...book,
        availableCopies: book.totalCopies,
      },
    });
  }

  const adminProfile = await prisma.profile.findUnique({ where: { email: adminEmail } });
  const firstStudent = await prisma.profile.findUnique({ where: { email: "student1@ciitm.edu" } });
  const sampleBook = await prisma.book.findFirst({ where: { category: "Computer Science" } });

  if (adminProfile && firstStudent && sampleBook) {
    const activeLoan = await prisma.transaction.findFirst({
      where: {
        profileId: firstStudent.id,
        bookId: sampleBook.id,
        status: { in: [TransactionStatus.ISSUED, TransactionStatus.OVERDUE] },
      },
    });

    if (!activeLoan) {
      await prisma.transaction.create({
        data: {
          profileId: firstStudent.id,
          bookId: sampleBook.id,
          status: TransactionStatus.ISSUED,
          dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          fineAmount: 0,
        },
      });

      await prisma.book.update({
        where: { id: sampleBook.id },
        data: { availableCopies: { decrement: 1 } },
      });
    }
  }

  console.log("Seeded CIITM demo data successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to seed CIITM library data.", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
