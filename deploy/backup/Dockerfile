# Nightly encrypted pg_dump (age, public-key encryption: the server cannot decrypt backups).
FROM postgres:18.6-trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends age ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh \
 && mkdir -p /backups && chown postgres:postgres /backups && chmod 0700 /backups
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["schedule"]
