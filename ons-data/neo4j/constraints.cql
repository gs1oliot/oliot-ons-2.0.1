CREATE CONSTRAINT ON (company:Company) ASSERT company.companyname IS UNIQUE;

CREATE CONSTRAINT ON (domain:Domain) ASSERT domain.domainname IS UNIQUE;

CREATE CONSTRAINT ON (record:Record) ASSERT record.recordname IS UNIQUE;

CREATE CONSTRAINT ON (server:Server) ASSERT server.servername IS UNIQUE;

CREATE CONSTRAINT ON (user:User) ASSERT user.username IS UNIQUE;
