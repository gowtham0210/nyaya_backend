/**
 * Adds a starter set of multiple-choice daily questions (see
 * GET /daily-questions/today). Each has exactly one correct option and an
 * explanation shown after the player answers.
 * Safe to re-run: a question whose text already exists is skipped, so edits
 * made in the admin panel are never overwritten.
 *
 *   node src/scripts/seed-daily-questions.js
 */
const { pool, withTransaction } = require('../config/database');

// The first option listed with `correct: true` is the right answer; options
// are stored in the order given.
const DAILY_QUESTIONS = [
  {
    category: 'Cyber & Online Issues',
    question: "Money was just taken from your account in an online fraud. What should you do first?",
    options: [
      { text: 'Wait a few days in case the money comes back on its own' },
      { text: 'Call the cyber crime helpline 1930 and inform your bank immediately', correct: true },
      { text: 'Reply to the fraudster and ask for the money back' },
      { text: 'Only post about it on social media' },
    ],
    answer:
      'Report financial cyber fraud as fast as possible on 1930 or cybercrime.gov.in, and tell your bank. Quick reporting gives the bank and police the best chance to freeze the money before it is moved. Keep screenshots, messages and transaction details as evidence.',
  },
  {
    category: 'Cyber & Online Issues',
    question: "A caller says they are from your bank and asks for the OTP to 'unblock' your account. What should you do?",
    options: [
      { text: 'Share the OTP, since the caller knows your name' },
      { text: 'Share only half of the OTP' },
      { text: "Don't share it, hang up and call the bank's official number yourself", correct: true },
      { text: 'Share it if the caller sounds official' },
    ],
    answer:
      "Banks never ask for your OTP, PIN or password over a call, SMS or email. An OTP lets someone approve a payment from your account. Hang up and contact the bank only through the number on its official website or your card.",
  },
  {
    category: 'Cyber & Online Issues',
    question:
      "Money is taken from your account through a data breach that was neither your fault nor the bank's, and you report it within 3 working days. What is your liability under RBI rules?",
    options: [
      { text: 'You lose the full amount' },
      { text: 'Zero: the amount must be credited back to you', correct: true },
      { text: 'You must pay half' },
      { text: 'It depends only on what the bank decides' },
    ],
    answer:
      "Under the RBI's 2017 rules on customer liability for unauthorised electronic transactions, if the breach is a third-party one (neither the bank's nor the customer's fault) and you report it within 3 working days, your liability is zero. Reporting later increases how much you may have to bear, so report immediately.",
  },
  {
    category: 'Police & Legal Process',
    question: 'The police refuse to register an FIR for a serious (cognizable) offence. What can you do?',
    options: [
      { text: 'Nothing: the police decision is final' },
      { text: 'Send your complaint in writing to the Superintendent of Police, and if needed approach a Magistrate', correct: true },
      { text: 'Only file a case directly in the Supreme Court' },
      { text: 'Wait a month and try the same station again' },
    ],
    answer:
      'Registering an FIR for a cognizable offence is mandatory. If the station refuses, you can send the substance of your complaint in writing to the Superintendent of Police (Section 173(4) BNSS, formerly Section 154(3) CrPC). If that also fails, you can apply to a Magistrate to order an investigation.',
  },
  {
    category: 'Police & Legal Process',
    question: 'Can you file an FIR at a police station outside the area where the crime took place?',
    options: [
      { text: 'No, only the local police station can take it' },
      { text: 'Yes, as a "Zero FIR", which the police must register and transfer', correct: true },
      { text: 'Only if the crime involved more than ₹1 lakh' },
      { text: 'Only with permission from a court' },
    ],
    answer:
      "A Zero FIR can be filed at any police station, whatever the area of the crime. The station must register it and transfer it to the station with jurisdiction. The BNSS (Section 173) now says this expressly, so no time is lost in reporting serious crimes.",
  },
  {
    category: 'Police & Legal Process',
    question: 'After an arrest, within how long must the person be produced before a magistrate?',
    options: [
      { text: '24 hours, not counting travel time', correct: true },
      { text: '7 days' },
      { text: '72 hours' },
      { text: 'Whenever the investigation is complete' },
    ],
    answer:
      'Article 22(2) of the Constitution says an arrested person must be produced before the nearest magistrate within 24 hours of arrest, excluding the time needed to travel there. They cannot be kept in custody beyond that without a magistrate’s order.',
  },
  {
    category: 'Police & Legal Process',
    question: 'Can a woman normally be arrested after sunset and before sunrise?',
    options: [
      { text: 'Yes, at any time, like anyone else' },
      { text: 'No, except in exceptional cases, by a woman officer with a Magistrate’s prior permission', correct: true },
      { text: 'Only if a male officer is present' },
      { text: 'Only on weekends' },
    ],
    answer:
      'The law (Section 43(5) BNSS, formerly Section 46(4) CrPC) says no woman shall be arrested after sunset and before sunrise, except in exceptional circumstances. Even then, a woman police officer must make the arrest, with prior permission from a Judicial Magistrate.',
  },
  {
    category: 'Consumer & Property',
    question: 'You paid ₹40,000 for a defective phone and the seller refuses to help. Where can you file a complaint?',
    options: [
      { text: 'The District Consumer Commission', correct: true },
      { text: 'Only the Supreme Court' },
      { text: 'The local police station' },
      { text: 'Nowhere, since it was bought online' },
    ],
    answer:
      'Under the Consumer Protection Act, 2019, complaints where the amount paid is up to ₹50 lakh go to the District Consumer Commission. Online purchases are covered too. You can file without a lawyer, and online through the e-Daakhil portal.',
  },
  {
    category: 'Consumer & Property',
    question: 'Can you file a consumer complaint online without visiting the commission?',
    options: [
      { text: 'No, it must be filed in person' },
      { text: 'Yes, through the e-Daakhil portal', correct: true },
      { text: 'Only by sending a letter to the company' },
      { text: 'Only through a lawyer’s office' },
    ],
    answer:
      'The e-Daakhil portal (edaakhil.nic.in) lets consumers file complaints online, pay the fee and track the case, without visiting the consumer commission in person.',
  },
  {
    category: 'Women & Child Safety',
    question:
      'An employee faces sexual harassment at a workplace with 10 or more employees. Under the POSH Act, 2013, where should they complain?',
    options: [
      { text: 'Only to a colleague' },
      { text: 'The Internal Committee (IC) set up by the employer', correct: true },
      { text: 'Nowhere: it must be handled informally' },
      { text: 'Only on social media' },
    ],
    answer:
      'The Sexual Harassment of Women at Workplace Act, 2013 requires every employer with 10 or more employees to set up an Internal Committee to hear complaints. A complaint should normally be made within 3 months of the incident; the committee can extend this by another 3 months for good reason.',
  },
  {
    category: 'Women & Child Safety',
    question: 'Which number can you call to report a child who needs care or protection?',
    options: [
      { text: '1098 (Childline)', correct: true },
      { text: '1930' },
      { text: '139' },
      { text: '1800' },
    ],
    answer:
      'Childline 1098 is a free, 24-hour emergency helpline for children in need of care and protection, such as abuse, child labour or a missing child. Anyone, including the child, can call.',
  },
  {
    category: 'Women & Child Safety',
    question: 'Under the Dowry Prohibition Act, 1961, who commits an offence?',
    options: [
      { text: 'Only the person who takes dowry' },
      { text: 'Only the person who gives dowry' },
      { text: 'Both the person who gives and the person who takes dowry', correct: true },
      { text: 'Nobody, if both families agree' },
    ],
    answer:
      'Giving, taking, or helping to give or take dowry are all punishable under the Dowry Prohibition Act, 1961. Demanding dowry is also an offence. Family agreement does not make it legal.',
  },
  {
    category: 'Employment & Workplace',
    question: 'Under the Payment of Gratuity Act, after how many years of continuous service does an employee usually become eligible for gratuity?',
    options: [
      { text: '1 year' },
      { text: '5 years', correct: true },
      { text: '10 years' },
      { text: 'Only at retirement age' },
    ],
    answer:
      'Gratuity is generally payable after at least 5 years of continuous service, when the employee resigns, retires or is terminated. The 5-year condition does not apply if employment ends because of death or disablement.',
  },
  {
    category: 'Family & Personal',
    question: 'Elderly parents are not being looked after by their adult children. Which law lets them claim maintenance?',
    options: [
      { text: 'The Maintenance and Welfare of Parents and Senior Citizens Act, 2007', correct: true },
      { text: 'The Consumer Protection Act, 2019' },
      { text: 'The Motor Vehicles Act' },
      { text: 'No law covers this' },
    ],
    answer:
      'Under the Senior Citizens Act, 2007, parents and senior citizens who cannot maintain themselves can apply to a Maintenance Tribunal for a monthly allowance from their children or relatives. The Tribunal is meant to decide quickly, and lawyers are not required.',
  },
  {
    category: 'Rights & Government',
    question: 'Within how many days must a Public Information Officer normally reply to an RTI application?',
    options: [
      { text: '7 days' },
      { text: '30 days', correct: true },
      { text: '90 days' },
      { text: 'There is no time limit' },
    ],
    answer:
      'Under the Right to Information Act, 2005, the Public Information Officer must reply within 30 days. If the information concerns someone’s life or liberty, it must be given within 48 hours. If there is no reply, you can file a first appeal.',
  },
];

async function run() {
  let added = 0;
  let skipped = 0;

  for (const item of DAILY_QUESTIONS) {
    if (item.options.filter((option) => option.correct).length !== 1) {
      throw new Error(`Exactly one correct option required: ${item.question}`);
    }

    const inserted = await withTransaction(async (connection) => {
      const [existing] = await connection.execute('SELECT id FROM daily_questions WHERE question = ? LIMIT 1', [
        item.question,
      ]);

      if (existing[0]) {
        return false;
      }

      const [result] = await connection.execute(
        'INSERT INTO daily_questions (category, question, answer, points_reward) VALUES (?, ?, ?, ?) RETURNING id',
        [item.category, item.question, item.answer, 10]
      );

      for (const [index, option] of item.options.entries()) {
        await connection.execute(
          `
            INSERT INTO daily_question_options (daily_question_id, option_text, is_correct, display_order)
            VALUES (?, ?, ?, ?)
          `,
          [Number(result.insertId), option.text, option.correct ? 1 : 0, index + 1]
        );
      }

      return true;
    });

    if (inserted) {
      added += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`Daily questions: ${added} added, ${skipped} already present.`);
  await pool.end();
}

run().catch(async (error) => {
  console.error('Seeding daily questions failed.');
  console.error(error.message);
  process.exitCode = 1;
  await pool.end();
});
