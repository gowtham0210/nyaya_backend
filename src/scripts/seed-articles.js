/**
 * Seeds the `articles` table with the full Indian Constitution index
 * (Parts I-XXII, Articles 1-395), matching the exact content provided.
 * Safe to re-run: uses INSERT IGNORE against the unique `slug` column.
 */
const { pool } = require('../config/database');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// [part, partTitle, articleRange, description]
const ENTRIES = [
  // Part I
  ['I', 'The Union and its Territory', 'Article 1', 'Name and territory of the Union.'],
  ['I', 'The Union and its Territory', 'Article 2', 'Admission or establishment of new States.'],
  ['I', 'The Union and its Territory', 'Article 3', 'Formation of new States and alteration of areas, boundaries or names of existing States.'],
  ['I', 'The Union and its Territory', 'Article 4', 'Laws made under articles 2 and 3 to provide for the amendment of the First and the Fourth Schedules and supplemental, incidental and consequential matters.'],

  // Part II
  ['II', 'Citizenship', 'Article 5', 'Citizenship at the commencement of the Constitution.'],
  ['II', 'Citizenship', 'Article 6', 'Rights of citizenship of certain persons who have migrated to India from Pakistan.'],
  ['II', 'Citizenship', 'Article 7', 'Rights of citizenship of certain migrants to Pakistan.'],
  ['II', 'Citizenship', 'Article 8', 'Rights of citizenship of certain persons of Indian origin residing outside India.'],
  ['II', 'Citizenship', 'Article 9', 'Persons voluntarily acquiring citizenship of a foreign State not to be citizens.'],
  ['II', 'Citizenship', 'Article 10', 'Continuance of the rights of citizenship.'],
  ['II', 'Citizenship', 'Article 11', 'Parliament to regulate the right of citizenship by law.'],

  // Part III
  ['III', 'Fundamental Rights', 'Article 12', 'Definition of "The State".'],
  ['III', 'Fundamental Rights', 'Article 13', 'Laws inconsistent with or in derogation of the fundamental rights.'],
  ['III', 'Fundamental Rights', 'Article 14', 'Equality before law.'],
  ['III', 'Fundamental Rights', 'Article 15', 'Prohibition of discrimination on grounds of religion, race, caste, sex or place of birth.'],
  ['III', 'Fundamental Rights', 'Article 16', 'Equality of opportunity in matters of public employment.'],
  ['III', 'Fundamental Rights', 'Article 17', 'Abolition of Untouchability.'],
  ['III', 'Fundamental Rights', 'Article 18', 'Abolition of titles.'],
  ['III', 'Fundamental Rights', 'Article 19', 'Protection of certain rights regarding freedom of speech, etc.'],
  ['III', 'Fundamental Rights', 'Article 20', 'Protection in respect of conviction for offenses.'],
  ['III', 'Fundamental Rights', 'Article 21', 'Protection of life and personal liberty.'],
  ['III', 'Fundamental Rights', 'Article 21A', 'Right to education.'],
  ['III', 'Fundamental Rights', 'Article 22', 'Protection against arrest and detention in certain cases.'],
  ['III', 'Fundamental Rights', 'Article 23', 'Prohibition of traffic in human beings and forced labor.'],
  ['III', 'Fundamental Rights', 'Article 24', 'Prohibition of employment of children in factories, etc.'],
  ['III', 'Fundamental Rights', 'Article 25', 'Freedom of conscience and free profession, practice and propagation of religion.'],
  ['III', 'Fundamental Rights', 'Article 26', 'Freedom to manage religious affairs.'],
  ['III', 'Fundamental Rights', 'Article 27', 'Freedom as to payment of taxes for promotion of any particular religion.'],
  ['III', 'Fundamental Rights', 'Article 28', 'Freedom as to attendance at religious instruction or religious worship in certain educational institutions.'],
  ['III', 'Fundamental Rights', 'Article 29', 'Protection of interests of minorities.'],
  ['III', 'Fundamental Rights', 'Article 30', 'Right of minorities to establish and administer educational institutions.'],
  ['III', 'Fundamental Rights', 'Article 31', '[Repealed] Compulsory acquisition of property.'],
  ['III', 'Fundamental Rights', 'Articles 31A to 31D', 'Saving of certain laws / Protection of agrarian reforms.'],
  ['III', 'Fundamental Rights', 'Article 32', 'Remedies for enforcement of rights conferred by this Part (Writs).'],
  ['III', 'Fundamental Rights', 'Article 32A', '[Repealed]'],
  ['III', 'Fundamental Rights', 'Article 33', 'Power of Parliament to modify the rights conferred by this Part in their application to Forces, etc.'],
  ['III', 'Fundamental Rights', 'Article 34', 'Restriction on rights conferred by this Part while martial law is in force in any area.'],
  ['III', 'Fundamental Rights', 'Article 35', 'Legislation to give effect to the provisions of this Part.'],

  // Part IV
  ['IV', 'Directive Principles of State Policy', 'Article 36', 'Definition.'],
  ['IV', 'Directive Principles of State Policy', 'Article 37', 'Application of the principles contained in this Part.'],
  ['IV', 'Directive Principles of State Policy', 'Article 38', 'State to secure a social order for the promotion of welfare of the people.'],
  ['IV', 'Directive Principles of State Policy', 'Article 39', 'Certain principles of policy to be followed by the State.'],
  ['IV', 'Directive Principles of State Policy', 'Article 39A', 'Equal justice and free legal aid.'],
  ['IV', 'Directive Principles of State Policy', 'Article 40', 'Organization of village panchayats.'],
  ['IV', 'Directive Principles of State Policy', 'Article 41', 'Right to work, to education and to public assistance in certain cases.'],
  ['IV', 'Directive Principles of State Policy', 'Article 42', 'Provision for just and humane conditions of work and maternity relief.'],
  ['IV', 'Directive Principles of State Policy', 'Article 43', 'Living wage, etc., for workers.'],
  ['IV', 'Directive Principles of State Policy', 'Article 43A', 'Participation of workers in management of industries.'],
  ['IV', 'Directive Principles of State Policy', 'Article 43B', 'Promotion of co-operative societies.'],
  ['IV', 'Directive Principles of State Policy', 'Article 44', 'Uniform civil code for the citizens.'],
  ['IV', 'Directive Principles of State Policy', 'Article 45', 'Provision for early childhood care and education to children below the age of six years.'],
  ['IV', 'Directive Principles of State Policy', 'Article 46', 'Promotion of educational and economic interests of Scheduled Castes, Scheduled Tribes and other weaker sections.'],
  ['IV', 'Directive Principles of State Policy', 'Article 47', 'Duty of the State to raise the level of nutrition and the standard of living and to improve public health.'],
  ['IV', 'Directive Principles of State Policy', 'Article 48', 'Organization of agriculture and animal husbandry.'],
  ['IV', 'Directive Principles of State Policy', 'Article 48A', 'Protection and improvement of environment and safeguarding of forests and wild life.'],
  ['IV', 'Directive Principles of State Policy', 'Article 49', 'Protection of monuments and places and objects of national importance.'],
  ['IV', 'Directive Principles of State Policy', 'Article 50', 'Separation of judiciary from executive.'],
  ['IV', 'Directive Principles of State Policy', 'Article 51', 'Promotion of international peace and security.'],

  // Part IV A
  ['IV A', 'Fundamental Duties', 'Article 51A', 'Fundamental duties of every citizen.'],

  // Part V
  ['V', 'The Union Government', 'Articles 52 to 73', 'The Executive (President, Vice-President, Powers, and Elections).'],
  ['V', 'The Union Government', 'Articles 74 to 75', 'Council of Ministers and Prime Minister.'],
  ['V', 'The Union Government', 'Article 76', 'Attorney-General for India.'],
  ['V', 'The Union Government', 'Articles 77 to 78', 'Conduct of Government Business.'],
  ['V', 'The Union Government', 'Articles 79 to 122', 'Parliament (Constitution, Officers, Salaries, Procedures, Financial Bills).'],
  ['V', 'The Union Government', 'Article 123', 'Legislative powers of the President (Ordinances).'],
  ['V', 'The Union Government', 'Articles 124 to 147', 'The Union Judiciary (Supreme Court establishment, powers, jurisdictions).'],
  ['V', 'The Union Government', 'Articles 148 to 151', 'Comptroller and Auditor-General of India (CAG).'],

  // Part VI
  ['VI', 'The State Governments', 'Article 152', 'General Definition.'],
  ['VI', 'The State Governments', 'Articles 153 to 162', 'The Executive (Governors and executive powers).'],
  ['VI', 'The State Governments', 'Articles 163 to 164', 'Council of Ministers and Chief Ministers.'],
  ['VI', 'The State Governments', 'Article 165', 'Advocate-General for the State.'],
  ['VI', 'The State Governments', 'Articles 166 to 167', 'Conduct of State Government Business.'],
  ['VI', 'The State Governments', 'Articles 168 to 212', 'State Legislatures (Assemblies, Councils, Procedures, Officers).'],
  ['VI', 'The State Governments', 'Article 213', 'Legislative powers of the Governor (Ordinances).'],
  ['VI', 'The State Governments', 'Articles 214 to 232', 'High Courts in the States.'],
  ['VI', 'The State Governments', 'Articles 233 to 237', 'Subordinate Courts (District judges, magisterial controls).'],

  // Part VII
  ['VII', '[Repealed]', 'Article 238', '[Repealed by the Constitution 7th Amendment Act, 1956]'],

  // Part VIII
  ['VIII', 'The Union Territories', 'Articles 239 to 242', 'Administration of UTs, Special provisions for Delhi (239AA), High Courts for UTs.'],

  // Parts IX, IXA, IXB
  ['IX', 'The Panchayats', 'Articles 243 to 243O', 'The Panchayats (Definitions, Gram Sabha, Constitution, Reservations, Finance Commissions).'],
  ['IX A', 'The Municipalities', 'Articles 243P to 243ZG', 'The Municipalities (Wards committees, Urban planning, Municipal elections).'],
  ['IX B', 'The Co-operative Societies', 'Articles 243ZH to 243ZT', 'The Co-operative Societies (Incorporation, Board members, Audit rules).'],

  // Part X
  ['X', 'Scheduled and Tribal Areas', 'Articles 244 to 244A', 'Administration of Scheduled Areas and Tribal Areas (Assam autonomies).'],

  // Part XI
  ['XI', 'Relations Between Union and States', 'Articles 245 to 255', 'Distribution of Legislative Powers (Parliament laws vs. State laws).'],
  ['XI', 'Relations Between Union and States', 'Articles 256 to 263', 'Administrative Relations (Inter-State Councils, water dispute resolutions).'],

  // Part XII
  ['XII', 'Finance, Property, Contracts and Suits', 'Articles 264 to 289', 'Financial distribution, Consolidated Funds, GST Council (279A), Finance Commission.'],
  ['XII', 'Finance, Property, Contracts and Suits', 'Articles 290 to 291', 'Miscellaneous financial items.'],
  ['XII', 'Finance, Property, Contracts and Suits', 'Articles 292 to 293', 'Borrowing by Central and State Governments.'],
  ['XII', 'Finance, Property, Contracts and Suits', 'Articles 294 to 300', 'Property, assets, liabilities, obligations, and contracts.'],
  ['XII', 'Finance, Property, Contracts and Suits', 'Article 300A', 'Right to property (No person to be deprived of property save by authority of law).'],

  // Part XIII
  ['XIII', 'Trade, Commerce and Intercourse', 'Articles 301 to 307', 'Freedom of trade, commerce, and restrictions authorized by Parliament/States.'],

  // Part XIV
  ['XIV', 'Services Under Union and States', 'Articles 308 to 314', 'Services (Civil services, tenure, recruitment rules).'],
  ['XIV', 'Services Under Union and States', 'Articles 315 to 323', 'Public Service Commissions (UPSC and State PSC structures, reports).'],

  // Part XIV A
  ['XIV A', 'Tribunals', 'Articles 323A to 323B', 'Administrative Tribunals and Tribunals for other matters (Tax, Labor, Land reforms).'],

  // Part XV
  ['XV', 'Elections', 'Articles 324 to 329A', 'Election Commission functions, adult suffrage, bar to interference by courts.'],

  // Part XVI
  ['XVI', 'Special Provisions Relating to Certain Classes', 'Articles 330 to 342B', 'Reservations for SC, ST in Lok Sabha/Assemblies, National Commissions for SC, ST, and OBCs.'],

  // Part XVII
  ['XVII', 'Official Language', 'Articles 343 to 344', 'Language of the Union (Hindi and English).'],
  ['XVII', 'Official Language', 'Articles 345 to 347', 'Regional languages.'],
  ['XVII', 'Official Language', 'Articles 348 to 349', 'Language of the Supreme Court and High Courts.'],
  ['XVII', 'Official Language', 'Articles 350 to 351', 'Special directives for primary mother-tongue education and Hindi promotion.'],

  // Part XVIII
  ['XVIII', 'Emergency Provisions', 'Article 352', 'Proclamation of National Emergency.'],
  ['XVIII', 'Emergency Provisions', 'Articles 353 to 354', 'Effects of Emergency.'],
  ['XVIII', 'Emergency Provisions', 'Article 355', 'Duty of Union to protect States against external aggression and internal disturbance.'],
  ['XVIII', 'Emergency Provisions', 'Article 356', 'Provisions in case of failure of constitutional machinery in States (President’s Rule).'],
  ['XVIII', 'Emergency Provisions', 'Article 357', 'Exercise of legislative powers under Article 356.'],
  ['XVIII', 'Emergency Provisions', 'Articles 358 to 359', 'Suspension of provisions of Article 19 and enforcement of rights during emergencies.'],
  ['XVIII', 'Emergency Provisions', 'Article 360', 'Provisions as to Financial Emergency.'],

  // Part XIX
  ['XIX', 'Miscellaneous', 'Articles 361 to 367', 'Protection of President and Governors, Major ports/aerodromes, Definitions, Interpretations.'],

  // Part XX
  ['XX', 'Amendment of the Constitution', 'Article 368', 'Power of Parliament to amend the Constitution and procedure therefor.'],

  // Part XXI
  ['XXI', 'Temporary, Transitional and Special Provisions', 'Article 369', 'Temporary power to Parliament to make laws.'],
  ['XXI', 'Temporary, Transitional and Special Provisions', 'Article 370', '[Temporary provisions with respect to the State of Jammu and Kashmir — operative clauses rendered ineffective]'],
  ['XXI', 'Temporary, Transitional and Special Provisions', 'Articles 371 to 371J', 'Special provisions for states (Maharashtra, Gujarat, Nagaland, Assam, Manipur, Andhra Pradesh, Sikkim, Mizoram, Arunachal Pradesh, Goa, Karnataka).'],
  ['XXI', 'Temporary, Transitional and Special Provisions', 'Articles 372 to 392', 'Continuance of existing laws, powers of the President to remove difficulties.'],

  // Part XXII
  ['XXII', 'Short Title, Commencement and Repeals', 'Article 393', 'Short title (This Constitution may be called the Constitution of India).'],
  ['XXII', 'Short Title, Commencement and Repeals', 'Article 394', 'Commencement.'],
  ['XXII', 'Short Title, Commencement and Repeals', 'Article 394A', 'Authoritative text in the Hindi language.'],
  ['XXII', 'Short Title, Commencement and Repeals', 'Article 395', 'Repeals (Repealing the Indian Independence Act, 1947).'],
];

async function run() {
  try {
    let inserted = 0;
    for (let i = 0; i < ENTRIES.length; i++) {
      const [part, partTitle, articleRange, description] = ENTRIES[i];
      const slug = slugify(`${articleRange}-${description}`).slice(0, 270);
      const [result] = await pool.query(
        `
          INSERT IGNORE INTO articles
            (part, part_title, title, slug, article_range, description, display_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [part, partTitle, description, slug, articleRange, description, i + 1]
      );
      if (result.affectedRows > 0) inserted++;
    }
    console.log(`Articles seed complete: ${inserted} new row(s) inserted out of ${ENTRIES.length} total entries.`);
  } catch (error) {
    console.error('Articles seed failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
